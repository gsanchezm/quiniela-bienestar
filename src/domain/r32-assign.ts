// Lógica PURA para llenar de un jalón las 16 llaves de dieciseisavos (R32) con
// los cruces reales que publica football-data.org una vez hecho el sorteo (o con
// una lista manual). Sin red ni DB para poder testear los bordes de forma
// determinista; el I/O vive en `scripts/assign-r32.ts`.
//
// Por qué hace falta: los partidos de eliminatoria se siembran sin equipos
// (`homeCode/awayCode = null`) y NADA automático los llena — el sync de
// football-data solo escribe marcadores de partidos que YA tienen equipos
// (ver `src/server/services/sync.ts`). Los equipos los pone el admin a mano
// (spec "bracket": avance manual, YAGNI). Este planificador es el atajo masivo.

/** Partido tal como lo entrega el proveedor (o una entrada manual normalizada). */
export interface ProviderFixture {
  utcDate: string; // ISO UTC
  status?: string;
  stage?: string;
  homeTeam: { tla?: string | null; name?: string | null };
  awayTeam: { tla?: string | null; name?: string | null };
}

/** Una llave R32 ya sembrada en nuestra BD (posiblemente vacía). */
export interface Llave {
  id: number;
  homeCode: string | null;
  awayCode: string | null;
  kickoffUtc: Date;
}

export type RowStatus =
  | 'assign' // llave vacía (TBD): se llena
  | 'occupied' // ya tenía equipos distintos: solo se pisa con --force (borra picks)
  | 'locked' // ya tenía otros equipos y el cruce inició: no se toca
  | 'unchanged'; // ya tenía exactamente estos equipos

export interface PlanRow {
  matchId: number;
  homeCode: string;
  awayCode: string;
  kickoffUtc: Date; // la hora que QUEDARÁ en efecto: la sembrada (default) o la real del proveedor (si setKickoff)
  providerKickoffUtc: Date; // la hora real del proveedor (informativa)
  status: RowStatus;
}

export interface Plan {
  rows: PlanRow[];
  errors: string[]; // problemas bloqueantes: no se debe escribir nada
  fixturesUsed: number;
}

// Códigos de fase candidatos para los dieciseisavos en football-data v4. Si el
// proveedor usa otro, el script lo descubre con `stageHistogram` y se pasa --stage.
export const R32_STAGE_CANDIDATES = ['LAST_32', 'ROUND_OF_32'] as const;

/** Cruces de la(s) fase(s) indicada(s) que YA tienen ambos equipos definidos. */
export function selectR32Fixtures(
  matches: ProviderFixture[],
  stages: readonly string[] = R32_STAGE_CANDIDATES,
): ProviderFixture[] {
  const set = new Set(stages);
  return matches.filter(
    (m) => m.stage != null && set.has(m.stage) && Boolean(m.homeTeam?.tla) && Boolean(m.awayTeam?.tla),
  );
}

/** Conteo de partidos por código de fase (diagnóstico para descubrir el nombre real). */
export function stageHistogram(matches: ProviderFixture[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const m of matches) {
    const k = m.stage ?? '(sin stage)';
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
}

/**
 * Empareja cada cruce (ordenado por fecha) con una llave (ordenada por id) y
 * decide qué hacer con cada una. La topología del cuadro es decorativa (spec),
 * así que el id de llave es solo un casillero: lo que importa para el puntaje y
 * para el sync posterior es el par (homeCode, awayCode) y la fecha, que tomamos
 * tal cual del proveedor.
 */
export function planAssignments(
  fixtures: ProviderFixture[],
  llaves: Llave[],
  knownCodes: Set<string>,
  now: Date,
  opts: { setKickoff: boolean } = { setKickoff: false },
): Plan {
  const errors: string[] = [];

  // 1) Todos los códigos del proveedor deben existir entre nuestras selecciones.
  for (const f of fixtures) {
    const h = f.homeTeam.tla ?? '';
    const a = f.awayTeam.tla ?? '';
    if (!knownCodes.has(h)) errors.push(`Código desconocido del proveedor: "${h}" (${f.homeTeam.name ?? '?'}).`);
    if (!knownCodes.has(a)) errors.push(`Código desconocido del proveedor: "${a}" (${f.awayTeam.name ?? '?'}).`);
  }

  // 2) Ningún equipo puede aparecer dos veces en la ronda (datos sospechosos).
  const seen = new Map<string, number>();
  for (const f of fixtures) {
    for (const code of [f.homeTeam.tla, f.awayTeam.tla]) {
      if (code) seen.set(code, (seen.get(code) ?? 0) + 1);
    }
  }
  for (const [code, n] of seen) {
    if (n > 1) errors.push(`El equipo ${code} aparece ${n} veces en los cruces — revisa los datos.`);
  }

  const sortedFixtures = [...fixtures].sort((x, y) => Date.parse(x.utcDate) - Date.parse(y.utcDate));
  const sortedLlaves = [...llaves].sort((x, y) => x.id - y.id);

  // 3) Las cantidades deben cuadrar (16 cruces ↔ 16 llaves).
  if (sortedFixtures.length !== sortedLlaves.length) {
    errors.push(
      `Hay ${sortedFixtures.length} cruces con equipos y ${sortedLlaves.length} llaves R32 — deben coincidir.`,
    );
  }

  const rows: PlanRow[] = [];
  const n = Math.min(sortedFixtures.length, sortedLlaves.length);
  for (let i = 0; i < n; i++) {
    const f = sortedFixtures[i];
    const l = sortedLlaves[i];
    const homeCode = f.homeTeam.tla!;
    const awayCode = f.awayTeam.tla!;
    const providerKickoffUtc = new Date(f.utcDate);
    // El cierre de picks lo gobierna la hora que quede en la BD: la sembrada si
    // no actualizamos, o la del proveedor si se pidió --set-kickoff.
    const kickoffUtc = opts.setKickoff ? providerKickoffUtc : l.kickoffUtc;

    const empty = l.homeCode === null && l.awayCode === null;
    const started = now.getTime() >= kickoffUtc.getTime();
    let status: RowStatus;
    if (l.homeCode === homeCode && l.awayCode === awayCode) {
      status = 'unchanged';
    } else if (empty) {
      status = 'assign';
    } else if (started) {
      status = 'locked';
    } else {
      status = 'occupied';
    }
    rows.push({ matchId: l.id, homeCode, awayCode, kickoffUtc, providerKickoffUtc, status });
  }

  return { rows, errors, fixturesUsed: n };
}
