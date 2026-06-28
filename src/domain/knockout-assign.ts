// Lógica PURA para llenar las llaves de eliminatoria (R32→FIN) con los cruces
// que publica football-data (o una lista manual). Sin red ni DB para testear
// bordes de forma determinista; el I/O vive en sync.ts y scripts/assign-knockout.ts.
//
// Conservador por diseño: solo planifica casilleros VACÍOS, nunca pisa equipos
// ya asignados ni partidos con picks. Tolera publicación incremental (ronda
// parcial). FIN se desambigua por `tag` (tercer lugar vs final).

export interface ProviderFixture {
  utcDate: string; // ISO UTC
  stage: string; // fase de football-data: LAST_32, LAST_16, QUARTER_FINALS, SEMI_FINALS, THIRD_PLACE, FINAL
  homeTeam: { tla?: string | null; name?: string | null };
  awayTeam: { tla?: string | null; name?: string | null };
}

export interface Llave {
  id: number;
  stage: string; // nuestra Stage: R32/R16/QF/SF/FIN
  tag: string | null; // para desambiguar FIN (tercer lugar vs final)
  homeCode: string | null;
  awayCode: string | null;
  kickoffUtc: Date;
}

export type RowStatus = 'assign' | 'unchanged';

export interface PlanRow {
  matchId: number;
  homeCode: string;
  awayCode: string;
  kickoffUtc: Date; // hora real del proveedor (se adopta al asignar)
  stage: string;
  status: RowStatus;
}

export interface Plan {
  rows: PlanRow[];
  anomalies: string[];
}

const FD_STAGE_TO_OURS: Record<string, string> = {
  LAST_32: 'R32',
  LAST_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: 'FIN',
  FINAL: 'FIN',
};

/** Fase football-data → nuestra Stage KO; null si no es eliminatoria. */
export function mapFdStage(fdStage: string): string | null {
  return FD_STAGE_TO_OURS[fdStage] ?? null;
}

/** Conteo de partidos por código de fase (diagnóstico). */
export function stageHistogram(matches: { stage?: string }[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const m of matches) {
    const k = m.stage ?? '(sin stage)';
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
}

const pairKey = (h: string, a: string) => `${h}/${a}`;

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

/** Elige el casillero vacío destino para un fixture de la ronda. */
function pickTarget(
  ourStage: string,
  fdStage: string,
  stageLlaves: Llave[],
  taken: Set<number>,
): Llave | undefined {
  const isFree = (l: Llave) => l.homeCode === null && l.awayCode === null && !taken.has(l.id);
  if (ourStage === 'FIN') {
    // THIRD_PLACE → llave con tag 'tercer'; FINAL → la otra.
    const wantThird = fdStage === 'THIRD_PLACE';
    return stageLlaves.find((l) => isFree(l) && /tercer/i.test(l.tag ?? '') === wantThird);
  }
  return stageLlaves.find(isFree); // el de menor id (stageLlaves viene ordenado)
}

export function planKnockoutAssignments(
  fixtures: ProviderFixture[],
  llaves: Llave[],
  knownCodes: Set<string>,
  now: Date,
): Plan {
  const rows: PlanRow[] = [];
  const anomalies: string[] = [];

  const llavesByStage = new Map<string, Llave[]>();
  for (const l of llaves) pushTo(llavesByStage, l.stage, l);

  const fixturesByStage = new Map<string, ProviderFixture[]>();
  for (const f of fixtures) {
    const ours = mapFdStage(f.stage);
    if (!ours) continue;
    if (!f.homeTeam?.tla || !f.awayTeam?.tla) continue;
    pushTo(fixturesByStage, ours, f);
  }

  for (const [stage, stageFixtures] of fixturesByStage) {
    const stageLlaves = (llavesByStage.get(stage) ?? []).slice().sort((a, b) => a.id - b.id);

    const taken = new Set<number>(); // llaves reservadas en este plan
    const usedTeams = new Set<string>();
    const existingPairs = new Set<string>();
    for (const l of stageLlaves) {
      if (l.homeCode && l.awayCode) {
        existingPairs.add(pairKey(l.homeCode, l.awayCode));
        usedTeams.add(l.homeCode);
        usedTeams.add(l.awayCode);
      }
    }

    const sorted = stageFixtures.slice().sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate));
    for (const f of sorted) {
      const home = f.homeTeam.tla!;
      const away = f.awayTeam.tla!;

      if (!knownCodes.has(home) || !knownCodes.has(away)) {
        const bad = !knownCodes.has(home) ? home : away;
        anomalies.push(`${stage}: código desconocido "${bad}" (${f.homeTeam.name ?? '?'} vs ${f.awayTeam.name ?? '?'}).`);
        continue;
      }

      if (existingPairs.has(pairKey(home, away))) {
        const l = stageLlaves.find((x) => x.homeCode === home && x.awayCode === away);
        if (l) rows.push({ matchId: l.id, homeCode: home, awayCode: away, kickoffUtc: new Date(f.utcDate), stage, status: 'unchanged' });
        continue;
      }

      if (usedTeams.has(home) || usedTeams.has(away)) {
        anomalies.push(`${stage}: ${usedTeams.has(home) ? home : away} aparece en más de un cruce.`);
        continue;
      }

      const kickoffUtc = new Date(f.utcDate);
      if (now.getTime() >= kickoffUtc.getTime()) {
        anomalies.push(`${stage}: ${home} vs ${away} ya inició y no se asignó a tiempo.`);
        continue;
      }

      const target = pickTarget(stage, f.stage, stageLlaves, taken);
      if (!target) {
        anomalies.push(`${stage}: hay más cruces que casilleros disponibles (sobra ${home} vs ${away}).`);
        continue;
      }

      taken.add(target.id);
      usedTeams.add(home);
      usedTeams.add(away);
      existingPairs.add(pairKey(home, away));
      rows.push({ matchId: target.id, homeCode: home, awayCode: away, kickoffUtc, stage, status: 'assign' });
    }
  }

  return { rows, anomalies };
}
