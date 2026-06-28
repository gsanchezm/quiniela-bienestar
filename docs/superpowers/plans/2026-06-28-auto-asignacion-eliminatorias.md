# Auto-asignación de equipos de eliminatoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el sync de 15 min llene automáticamente las llaves de eliminatoria vacías con los cruces que publica football-data (todas las rondas) y avise por correo al admin.

**Architecture:** Una orquestación `runFullSync` reemplaza la llamada directa a `runSync` en el cron (`/api/sync`) y el botón de admin. Hace UNA llamada a football-data y la parte: partidos finalizados → goles (`runSync`, sin cambios); fixtures KO con equipos → auto-asignación conservadora (`runKnockoutAutoAssign`, solo llena casilleros vacíos). Si se asignó algo nuevo o hubo anomalías, manda correo (best-effort).

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript strict, Prisma + PostgreSQL, Vitest, Resend, football-data.org v4.

## Global Constraints

- Node ≥ 20; gestor `pnpm@11.2.2`; ejecutar scripts con `pnpm exec tsx`.
- TypeScript `strict`. Tests en `src/**/*.test.ts` (Vitest, `environment: 'node'`). Correr con `pnpm test`.
- Alias de imports: `@/` → `src/`.
- Copys e identificadores de dominio en español; commits estilo conventional (`feat:`, `test:`, `refactor:`, `docs:`).
- **Sin cambios** al esquema de Prisma ni a la lógica de puntaje.
- Invariante de seguridad: la auto-asignación **solo escribe casilleros vacíos** (`homeCode` y `awayCode` ambos `null`); nunca pisa equipos ya asignados ni partidos con picks; respeta cierres (`now < kickoff`); usa el orden home/away del proveedor; **adopta la hora real del proveedor** al asignar.
- Mapeo de fases football-data → nuestra `Stage` (verificado en vivo): `LAST_32→R32`, `LAST_16→R16`, `QUARTER_FINALS→QF`, `SEMI_FINALS→SF`, `THIRD_PLACE→FIN` (llave con `tag` `/tercer/i`), `FINAL→FIN`.
- Correo best-effort: su fallo nunca rompe el sync. ⚠️ Resend en sandbox → solo se entrega a la dirección dueña de la cuenta.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/domain/knockout-assign.ts` | **(renombrado de `r32-assign.ts`)** Lógica pura: mapeo de fases, plan de asignación por ronda (slot-fill, FIN por tag, validación por ronda → `{rows, anomalies}`). |
| `src/domain/knockout-assign.test.ts` | Tests puros del planner. |
| `src/server/services/sync.ts` | `fetchAll()` + `selectFinished`/`selectKnockoutFixtures`; `runKnockoutAutoAssign` + `prismaKnockoutAssignRepo`; `runFullSync` + tipos. |
| `src/server/services/sync.test.ts` | Tests de selectores, `runKnockoutAutoAssign` (repo falso) y `runFullSync` (deps falsas). |
| `src/server/email/templates.ts` (+ `.test.ts`) | `knockoutAssignedEmail`. |
| `src/app/api/sync/route.ts` | Llama a `runFullSync`. |
| `src/app/actions/results.ts` | `syncNowAction` llama a `runFullSync`; resultado incluye `assign`. |
| `src/components/admin/AdminScreen.tsx` | Muestra el resumen de auto-asignación. |
| `scripts/assign-knockout.ts` | **(renombrado de `assign-r32.ts`)** Herramienta manual break-glass sobre el planner generalizado. |

---

### Task 1: Generalizar el planner puro → `knockout-assign.ts`

**Files:**
- Rename + rewrite: `src/domain/r32-assign.ts` → `src/domain/knockout-assign.ts`
- Rename + rewrite: `src/domain/r32-assign.test.ts` → `src/domain/knockout-assign.test.ts`
- Rename + update: `scripts/assign-r32.ts` → `scripts/assign-knockout.ts`

**Interfaces:**
- Produces:
  - `interface ProviderFixture { utcDate: string; stage: string; homeTeam: { tla?: string | null; name?: string | null }; awayTeam: { tla?: string | null; name?: string | null } }`
  - `interface Llave { id: number; stage: string; tag: string | null; homeCode: string | null; awayCode: string | null; kickoffUtc: Date }`
  - `type RowStatus = 'assign' | 'unchanged'`
  - `interface PlanRow { matchId: number; homeCode: string; awayCode: string; kickoffUtc: Date; stage: string; status: RowStatus }`
  - `interface Plan { rows: PlanRow[]; anomalies: string[] }`
  - `function mapFdStage(fdStage: string): string | null`
  - `function planKnockoutAssignments(fixtures: ProviderFixture[], llaves: Llave[], knownCodes: Set<string>, now: Date): Plan`
  - `function stageHistogram(matches: { stage?: string }[]): Record<string, number>`

- [ ] **Step 1: Mover los archivos con git (preserva historia)**

```bash
git mv src/domain/r32-assign.ts src/domain/knockout-assign.ts
git mv src/domain/r32-assign.test.ts src/domain/knockout-assign.test.ts
git mv scripts/assign-r32.ts scripts/assign-knockout.ts
```

- [ ] **Step 2: Escribir los tests fallidos** (reemplaza TODO el contenido de `src/domain/knockout-assign.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import {
  mapFdStage,
  planKnockoutAssignments,
  stageHistogram,
  type Llave,
  type ProviderFixture,
} from './knockout-assign';

const known = new Set(['ESP', 'URU', 'MEX', 'BRA', 'ARG', 'FRA', 'GER', 'POR', 'COL', 'NED']);
const now = new Date('2026-06-28T10:00:00Z');

const fx = (home: string, away: string, utcDate: string, stage = 'LAST_32'): ProviderFixture => ({
  utcDate,
  stage,
  homeTeam: { tla: home, name: home },
  awayTeam: { tla: away, name: away },
});

// Llave KO vacía sembrada.
const tbd = (id: number, stage: string, utcDate: string, tag: string | null = null): Llave => ({
  id,
  stage,
  tag,
  homeCode: null,
  awayCode: null,
  kickoffUtc: new Date(utcDate),
});

describe('mapFdStage', () => {
  it('mapea las fases KO de football-data a nuestras Stage', () => {
    expect(mapFdStage('LAST_32')).toBe('R32');
    expect(mapFdStage('LAST_16')).toBe('R16');
    expect(mapFdStage('QUARTER_FINALS')).toBe('QF');
    expect(mapFdStage('SEMI_FINALS')).toBe('SF');
    expect(mapFdStage('THIRD_PLACE')).toBe('FIN');
    expect(mapFdStage('FINAL')).toBe('FIN');
  });
  it('devuelve null para fases no-KO', () => {
    expect(mapFdStage('GROUP_STAGE')).toBeNull();
  });
});

describe('stageHistogram', () => {
  it('cuenta partidos por nombre de fase', () => {
    expect(stageHistogram([{ stage: 'LAST_32' }, { stage: 'LAST_32' }, { stage: 'GROUP_STAGE' }])).toEqual({
      LAST_32: 2,
      GROUP_STAGE: 1,
    });
  });
});

describe('planKnockoutAssignments', () => {
  it('llena casilleros vacíos conservando el orden home/away y adoptando la hora del proveedor', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z'), fx('MEX', 'BRA', '2026-06-28T20:00:00Z')];
    const llaves = [tbd(73, 'R32', '2026-06-28T17:00:00Z'), tbd(74, 'R32', '2026-06-28T20:00:00Z')];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.anomalies).toEqual([]);
    expect(plan.rows).toEqual([
      { matchId: 73, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: new Date('2026-06-28T18:30:00Z'), stage: 'R32', status: 'assign' },
      { matchId: 74, homeCode: 'MEX', awayCode: 'BRA', kickoffUtc: new Date('2026-06-28T20:00:00Z'), stage: 'R32', status: 'assign' },
    ]);
  });

  it('tolera ronda parcial: 1 de 2 cruces → llena 1, sin anomalía', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z')];
    const llaves = [tbd(73, 'R32', '2026-06-28T17:00:00Z'), tbd(74, 'R32', '2026-06-28T20:00:00Z')];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.anomalies).toEqual([]);
    expect(plan.rows).toEqual([
      { matchId: 73, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: new Date('2026-06-28T18:30:00Z'), stage: 'R32', status: 'assign' },
    ]);
  });

  it('FIN: THIRD_PLACE va a la llave con tag tercer, FINAL a la otra (no por orden)', () => {
    // El fixture de la FINAL llega primero en la lista, pero debe ir a la llave 104.
    const fixtures = [
      fx('ESP', 'BRA', '2026-07-19T19:00:00Z', 'FINAL'),
      fx('MEX', 'ARG', '2026-07-18T20:00:00Z', 'THIRD_PLACE'),
    ];
    const llaves = [
      tbd(103, 'FIN', '2026-07-18T20:00:00Z', 'Tercer lugar — Miami'),
      tbd(104, 'FIN', '2026-07-19T19:00:00Z', 'LA FINAL — Nueva York/NJ'),
    ];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.anomalies).toEqual([]);
    expect(plan.rows.find((r) => r.matchId === 103)).toMatchObject({ homeCode: 'MEX', awayCode: 'ARG' });
    expect(plan.rows.find((r) => r.matchId === 104)).toMatchObject({ homeCode: 'ESP', awayCode: 'BRA' });
  });

  it('es idempotente: un cruce ya presente sale unchanged, no se reasigna', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z')];
    const llaves: Llave[] = [
      { id: 73, stage: 'R32', tag: null, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: new Date('2026-06-28T17:00:00Z') },
      tbd(74, 'R32', '2026-06-28T20:00:00Z'),
    ];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.rows).toEqual([
      { matchId: 73, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: new Date('2026-06-28T18:30:00Z'), stage: 'R32', status: 'unchanged' },
    ]);
  });

  it('anomalía si un TLA no existe entre nuestras selecciones', () => {
    const fixtures = [fx('ESP', 'XXX', '2026-06-28T18:30:00Z')];
    const plan = planKnockoutAssignments(fixtures, [tbd(73, 'R32', '2026-06-28T17:00:00Z')], known, now);
    expect(plan.rows).toEqual([]);
    expect(plan.anomalies.some((a) => a.includes('XXX'))).toBe(true);
  });

  it('anomalía si un equipo aparece en dos cruces de la misma ronda', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z'), fx('ESP', 'BRA', '2026-06-28T20:00:00Z')];
    const llaves = [tbd(73, 'R32', '2026-06-28T17:00:00Z'), tbd(74, 'R32', '2026-06-28T20:00:00Z')];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.anomalies.some((a) => a.includes('ESP'))).toBe(true);
  });

  it('anomalía si hay más cruces que casilleros vacíos', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z'), fx('MEX', 'BRA', '2026-06-28T20:00:00Z')];
    const llaves = [tbd(73, 'R32', '2026-06-28T17:00:00Z')];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.rows).toHaveLength(1);
    expect(plan.anomalies.some((a) => a.includes('más cruces'))).toBe(true);
  });

  it('anomalía si el cruce ya inició (no se asignó a tiempo)', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T09:00:00Z')]; // antes de `now`
    const plan = planKnockoutAssignments(fixtures, [tbd(73, 'R32', '2026-06-28T09:00:00Z')], known, now);
    expect(plan.rows).toEqual([]);
    expect(plan.anomalies.some((a) => a.includes('inició'))).toBe(true);
  });

  it('procesa cada ronda independiente: octavos válido + cuartos con error', () => {
    const fixtures = [
      fx('ESP', 'URU', '2026-07-04T18:00:00Z', 'LAST_16'),
      fx('MEX', 'ZZZ', '2026-07-09T20:00:00Z', 'QUARTER_FINALS'),
    ];
    const llaves = [tbd(89, 'R16', '2026-07-04T17:00:00Z'), tbd(97, 'QF', '2026-07-09T20:00:00Z')];
    const plan = planKnockoutAssignments(fixtures, llaves, known, now);
    expect(plan.rows).toEqual([
      { matchId: 89, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: new Date('2026-07-04T18:00:00Z'), stage: 'R16', status: 'assign' },
    ]);
    expect(plan.anomalies.some((a) => a.includes('ZZZ'))).toBe(true);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run src/domain/knockout-assign.test.ts`
Expected: FAIL (`knockout-assign` no exporta `mapFdStage`/`planKnockoutAssignments`, etc.)

- [ ] **Step 4: Escribir la implementación** (reemplaza TODO el contenido de `src/domain/knockout-assign.ts`)

```ts
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
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run src/domain/knockout-assign.test.ts`
Expected: PASS (todos)

- [ ] **Step 6: Actualizar el script break-glass** (reemplaza TODO el contenido de `scripts/assign-knockout.ts`)

```ts
// One-off OPERATIVO (break-glass): llena las llaves de eliminatoria vacías con
// los cruces de football-data (o --from-json) de un jalón. Seguro por defecto:
// DRY-RUN; escribe solo con --apply. La ruta normal es AUTOMÁTICA (sync de 15
// min); esto es por si hay que forzarlo a mano.
//
// Uso:
//   DATABASE_URL=... FOOTBALL_DATA_TOKEN=... pnpm exec tsx --env-file=.env scripts/assign-knockout.ts
//   ... --apply
//   ... --from-json cruces.json   ([{ "stage":"LAST_16","home":"ESP","away":"URU","kickoffUtc":"2026-07-04T18:00:00Z" }, ...])
import { readFileSync } from 'node:fs';
import { db } from '../src/server/db';
import {
  planKnockoutAssignments,
  mapFdStage,
  stageHistogram,
  type Llave,
  type ProviderFixture,
} from '../src/domain/knockout-assign';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const valueOf = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = has('--apply');
const fromJson = valueOf('--from-json');

async function getFixtures(): Promise<ProviderFixture[]> {
  if (fromJson) {
    const raw = JSON.parse(readFileSync(fromJson, 'utf8')) as Array<{
      stage: string;
      home: string;
      away: string;
      kickoffUtc: string;
    }>;
    return raw.map((r) => ({
      utcDate: r.kickoffUtc,
      stage: r.stage,
      homeTeam: { tla: r.home, name: r.home },
      awayTeam: { tla: r.away, name: r.away },
    }));
  }
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('Falta FOOTBALL_DATA_TOKEN (o usa --from-json <archivo>).');
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': token },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`football-data.org respondió ${res.status}`);
  const data = (await res.json()) as { matches?: Array<ProviderFixture & { stage: string }> };
  const all = data.matches ?? [];
  console.log('Fases reportadas por football-data:', stageHistogram(all));
  return all.filter((m) => mapFdStage(m.stage) !== null && m.homeTeam?.tla && m.awayTeam?.tla);
}

async function main() {
  const [teams, llaveRows] = await Promise.all([
    db.team.findMany({ select: { code: true, name: true } }),
    db.match.findMany({
      where: { isKnockout: true },
      select: { id: true, stage: true, tag: true, homeCode: true, awayCode: true, kickoffUtc: true },
    }),
  ]);
  const knownCodes = new Set(teams.map((t) => t.code));
  const nameOf = new Map(teams.map((t) => [t.code, t.name]));
  const llaves: Llave[] = llaveRows.map((r) => ({ ...r, stage: r.stage as string }));

  const fixtures = await getFixtures();
  console.log(`\nCruces KO con equipos: ${fixtures.length}  ·  llaves KO en BD: ${llaves.length}`);

  const plan = planKnockoutAssignments(fixtures, llaves, knownCodes, new Date());
  const label = (c: string) => `${nameOf.get(c) ?? '??'} (${c})`;
  console.log('\nPlan (llave → local vs visitante · kickoff UTC · estado):');
  for (const r of plan.rows) {
    console.log(`  #${r.matchId} [${r.stage}]  ${label(r.homeCode)}  vs  ${label(r.awayCode)}  ·  ${r.kickoffUtc.toISOString()}  ·  ${r.status}`);
  }
  if (plan.anomalies.length) {
    console.log('\n⚠️ Anomalías:');
    for (const a of plan.anomalies) console.log('   - ' + a);
  }

  const writable = plan.rows.filter((r) => r.status === 'assign');
  if (!APPLY) {
    console.log(`\nDRY-RUN: se escribirían ${writable.length} llave(s). Corre con --apply para aplicar.`);
    return;
  }
  let written = 0;
  for (const r of writable) {
    await db.match.update({
      where: { id: r.matchId },
      data: { homeCode: r.homeCode, awayCode: r.awayCode, kickoffUtc: r.kickoffUtc },
    });
    written += 1;
  }
  console.log(`\n✓ Aplicado: ${written} llave(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
```

- [ ] **Step 7: Verificar typecheck de todo el proyecto**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0 (sin errores).

- [ ] **Step 8: Commit**

```bash
git add src/domain/knockout-assign.ts src/domain/knockout-assign.test.ts scripts/assign-knockout.ts
git commit -m "refactor(eliminatorias): generaliza el planner a todas las rondas KO (slot-fill, FIN por tag)"
```

---

### Task 2: `fetchAll()` + selectores en `sync.ts`

**Files:**
- Modify: `src/server/services/sync.ts`
- Test: `src/server/services/sync.test.ts`

**Interfaces:**
- Consumes: `mapFdStage`, `ProviderFixture` de `@/domain/knockout-assign`.
- Produces:
  - `interface ProviderRawMatch { utcDate: string; status: string; stage: string; homeTeam: { tla?: string | null; name?: string | null }; awayTeam: { tla?: string | null; name?: string | null }; score: { winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null; duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'; fullTime: { home: number | null; away: number | null } } }`
  - `interface ResultsProvider { fetchAll(): Promise<ProviderRawMatch[]> }`
  - `function selectFinished(all: ProviderRawMatch[]): ProviderMatch[]`
  - `function selectKnockoutFixtures(all: ProviderRawMatch[]): ProviderFixture[]`

- [ ] **Step 1: Escribir los tests fallidos** (añadir al inicio de `src/server/services/sync.test.ts`, tras los imports existentes — agrega `selectFinished`, `selectKnockoutFixtures`, `type ProviderRawMatch` al import de `./sync`)

```ts
import { describe, it, expect } from 'vitest';
import {
  runSync,
  selectFinished,
  selectKnockoutFixtures,
  type ProviderMatch,
  type ProviderRawMatch,
  type SyncRepo,
  type SyncMatch,
} from './sync';

const rawMatch = (over: Partial<ProviderRawMatch> = {}): ProviderRawMatch => ({
  utcDate: '2026-06-11T19:00:00Z',
  status: 'FINISHED',
  stage: 'GROUP_STAGE',
  homeTeam: { tla: 'MEX', name: 'México' },
  awayTeam: { tla: 'RSA', name: 'Sudáfrica' },
  score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 0 } },
  ...over,
});

describe('selectores del proveedor', () => {
  it('selectFinished toma solo FINISHED con marcador y lo normaliza', () => {
    const all = [
      rawMatch(),
      rawMatch({ status: 'TIMED', score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } } }),
    ];
    const finished = selectFinished(all);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ homeTla: 'MEX', awayTla: 'RSA', fullTime: { home: 2, away: 0 } });
  });

  it('selectKnockoutFixtures toma fases KO con ambos equipos definidos', () => {
    const all = [
      rawMatch({ stage: 'LAST_32', homeTeam: { tla: 'ESP' }, awayTeam: { tla: 'URU' } }),
      rawMatch({ stage: 'GROUP_STAGE' }), // no KO
      rawMatch({ stage: 'LAST_16', homeTeam: { tla: null }, awayTeam: { tla: 'BRA' } }), // sin equipo
    ];
    const ko = selectKnockoutFixtures(all);
    expect(ko).toHaveLength(1);
    expect(ko[0]).toMatchObject({ stage: 'LAST_32', homeTeam: { tla: 'ESP' }, awayTeam: { tla: 'URU' } });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run src/server/services/sync.test.ts`
Expected: FAIL (`selectFinished`/`selectKnockoutFixtures` no existen).

- [ ] **Step 3: Implementar** en `src/server/services/sync.ts`. Añade el import al inicio y reemplaza el bloque del proveedor real.

Añadir tras los imports existentes:

```ts
import { mapFdStage, type ProviderFixture } from '@/domain/knockout-assign';
```

Reemplazar el bloque `// --- Proveedor real: football-data.org v4 ---` y la clase `FootballDataProvider` y el `interface FdMatch` y `interface ResultsProvider` por:

```ts
// --- Proveedor real: football-data.org v4 ---------------------------------

// Partido crudo del proveedor (lo que devuelve /competitions/WC/matches).
export interface ProviderRawMatch {
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: { tla?: string | null; name?: string | null };
  awayTeam: { tla?: string | null; name?: string | null };
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
    fullTime: { home: number | null; away: number | null };
  };
}

/** Finalizados con marcador → forma que consume runSync (goles). */
export function selectFinished(all: ProviderRawMatch[]): ProviderMatch[] {
  return all
    .filter((m) => m.status === 'FINISHED' && m.score.fullTime.home !== null)
    .map((m) => ({
      homeTla: m.homeTeam.tla ?? null,
      awayTla: m.awayTeam.tla ?? null,
      utcDate: m.utcDate,
      fullTime: { home: m.score.fullTime.home!, away: m.score.fullTime.away! },
      duration: m.score.duration,
      winner: m.score.winner,
    }));
}

/** Cruces de fase KO con ambos equipos definidos → forma que consume la asignación. */
export function selectKnockoutFixtures(all: ProviderRawMatch[]): ProviderFixture[] {
  return all
    .filter((m) => mapFdStage(m.stage) !== null && Boolean(m.homeTeam?.tla) && Boolean(m.awayTeam?.tla))
    .map((m) => ({ utcDate: m.utcDate, stage: m.stage, homeTeam: m.homeTeam, awayTeam: m.awayTeam }));
}
```

Reemplazar la `interface ResultsProvider` (arriba en el archivo) por:

```ts
export interface ResultsProvider {
  fetchAll(): Promise<ProviderRawMatch[]>;
}
```

Reemplazar la clase `FootballDataProvider` por:

```ts
export class FootballDataProvider implements ResultsProvider {
  constructor(private readonly token: string) {}

  async fetchAll(): Promise<ProviderRawMatch[]> {
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': this.token },
      cache: 'no-store',
    });
    if (res.status === 429) {
      throw new Error(
        'football-data.org limita el plan gratuito a 10 consultas por minuto — espera un minuto y reintenta.',
      );
    }
    if (!res.ok) throw new Error(`football-data.org respondió ${res.status}`);
    const data = (await res.json()) as { matches?: ProviderRawMatch[] };
    return data.matches ?? [];
  }
}
```

> Nota: la antigua `interface FdMatch` y el método `fetchFinished()` se eliminan (su lógica de filtrado/mapeo ahora vive en `selectFinished`). `runSync`, `ProviderMatch`, `SyncRepo`, `prismaSyncRepo` y `getResultsProvider` NO cambian.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run src/server/services/sync.test.ts`
Expected: PASS (selectores + los de `runSync` existentes).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sync.ts src/server/services/sync.test.ts
git commit -m "refactor(sync): fetchAll + selectores selectFinished/selectKnockoutFixtures"
```

---

### Task 3: `runKnockoutAutoAssign` + `prismaKnockoutAssignRepo`

**Files:**
- Modify: `src/server/services/sync.ts`
- Test: `src/server/services/sync.test.ts`

**Interfaces:**
- Consumes: `planKnockoutAssignments`, `Llave`, `ProviderFixture` de `@/domain/knockout-assign`.
- Produces:
  - `interface KnockoutAssignRepo { getKnockoutLlaves(): Promise<Llave[]>; getKnownTeamCodes(): Promise<Set<string>>; assignTeams(id: number, home: string, away: string, kickoffUtc: Date): Promise<void> }`
  - `interface KnockoutAssignResult { assigned: Array<{ matchId: number; stage: string; homeCode: string; awayCode: string }>; anomalies: string[] }`
  - `function runKnockoutAutoAssign(repo: KnockoutAssignRepo, fixtures: ProviderFixture[], now: Date): Promise<KnockoutAssignResult>`
  - `function prismaKnockoutAssignRepo(db: PrismaClient): KnockoutAssignRepo`

- [ ] **Step 1: Escribir el test fallido** (añadir a `src/server/services/sync.test.ts`; agrega `runKnockoutAutoAssign`, `type KnockoutAssignRepo`, `type Llave` a los imports — `Llave` viene de `@/domain/knockout-assign`)

```ts
import { runKnockoutAutoAssign, type KnockoutAssignRepo } from './sync';
import type { Llave, ProviderFixture } from '@/domain/knockout-assign';

function fakeAssignRepo(llaves: Llave[], known: string[]) {
  const writes: Array<{ id: number; home: string; away: string; kickoff: string }> = [];
  const repo: KnockoutAssignRepo = {
    async getKnockoutLlaves() {
      return llaves;
    },
    async getKnownTeamCodes() {
      return new Set(known);
    },
    async assignTeams(id, home, away, kickoffUtc) {
      writes.push({ id, home, away, kickoff: kickoffUtc.toISOString() });
    },
  };
  return { repo, writes };
}

const tbdLlave = (id: number, stage: string, kickoffUtc: string, tag: string | null = null): Llave => ({
  id,
  stage,
  tag,
  homeCode: null,
  awayCode: null,
  kickoffUtc: new Date(kickoffUtc),
});

const fixture = (home: string, away: string, utcDate: string, stage = 'LAST_32'): ProviderFixture => ({
  utcDate,
  stage,
  homeTeam: { tla: home, name: home },
  awayTeam: { tla: away, name: away },
});

describe('runKnockoutAutoAssign', () => {
  const now = new Date('2026-06-28T10:00:00Z');

  it('escribe solo las llaves vacías y reporta lo asignado', async () => {
    const { repo, writes } = fakeAssignRepo(
      [tbdLlave(73, 'R32', '2026-06-28T17:00:00Z'), tbdLlave(74, 'R32', '2026-06-28T20:00:00Z')],
      ['ESP', 'URU', 'MEX', 'BRA'],
    );
    const result = await runKnockoutAutoAssign(
      repo,
      [fixture('ESP', 'URU', '2026-06-28T18:30:00Z'), fixture('MEX', 'BRA', '2026-06-28T20:00:00Z')],
      now,
    );
    expect(writes).toEqual([
      { id: 73, home: 'ESP', away: 'URU', kickoff: '2026-06-28T18:30:00.000Z' },
      { id: 74, home: 'MEX', away: 'BRA', kickoff: '2026-06-28T20:00:00.000Z' },
    ]);
    expect(result.assigned).toHaveLength(2);
    expect(result.anomalies).toEqual([]);
  });

  it('no escribe nada y propaga anomalías cuando hay datos inválidos', async () => {
    const { repo, writes } = fakeAssignRepo([tbdLlave(73, 'R32', '2026-06-28T17:00:00Z')], ['ESP']);
    const result = await runKnockoutAutoAssign(repo, [fixture('ESP', 'ZZZ', '2026-06-28T18:30:00Z')], now);
    expect(writes).toEqual([]);
    expect(result.assigned).toEqual([]);
    expect(result.anomalies.some((a) => a.includes('ZZZ'))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm exec vitest run src/server/services/sync.test.ts`
Expected: FAIL (`runKnockoutAutoAssign` no existe).

- [ ] **Step 3: Implementar** en `src/server/services/sync.ts`. Amplía el import del dominio y añade el bloque al final del archivo (antes de `getResultsProvider`).

Cambiar el import del dominio a:

```ts
import { mapFdStage, planKnockoutAssignments, type Llave, type ProviderFixture } from '@/domain/knockout-assign';
```

Añadir:

```ts
// --- Auto-asignación de equipos de eliminatoria ---------------------------

export interface KnockoutAssignRepo {
  getKnockoutLlaves(): Promise<Llave[]>;
  getKnownTeamCodes(): Promise<Set<string>>;
  assignTeams(id: number, home: string, away: string, kickoffUtc: Date): Promise<void>;
}

export interface KnockoutAssignResult {
  assigned: Array<{ matchId: number; stage: string; homeCode: string; awayCode: string }>;
  anomalies: string[];
}

// Conservador: solo escribe casilleros vacíos (status 'assign'). Idempotente.
export async function runKnockoutAutoAssign(
  repo: KnockoutAssignRepo,
  fixtures: ProviderFixture[],
  now: Date,
): Promise<KnockoutAssignResult> {
  const [llaves, knownCodes] = await Promise.all([repo.getKnockoutLlaves(), repo.getKnownTeamCodes()]);
  const plan = planKnockoutAssignments(fixtures, llaves, knownCodes, now);

  const assigned: KnockoutAssignResult['assigned'] = [];
  for (const r of plan.rows) {
    if (r.status !== 'assign') continue;
    await repo.assignTeams(r.matchId, r.homeCode, r.awayCode, r.kickoffUtc);
    assigned.push({ matchId: r.matchId, stage: r.stage, homeCode: r.homeCode, awayCode: r.awayCode });
  }
  return { assigned, anomalies: plan.anomalies };
}

export function prismaKnockoutAssignRepo(db: PrismaClient): KnockoutAssignRepo {
  return {
    async getKnockoutLlaves() {
      const rows = await db.match.findMany({
        where: { isKnockout: true },
        select: { id: true, stage: true, tag: true, homeCode: true, awayCode: true, kickoffUtc: true },
      });
      return rows.map((r) => ({ ...r, stage: r.stage as string }));
    },
    async getKnownTeamCodes() {
      const teams = await db.team.findMany({ select: { code: true } });
      return new Set(teams.map((t) => t.code));
    },
    async assignTeams(id, home, away, kickoffUtc) {
      await db.match.update({ where: { id }, data: { homeCode: home, awayCode: away, kickoffUtc } });
    },
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm exec vitest run src/server/services/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sync.ts src/server/services/sync.test.ts
git commit -m "feat(sync): runKnockoutAutoAssign — llena llaves KO vacías (conservador)"
```

---

### Task 4: Plantilla de correo `knockoutAssignedEmail`

**Files:**
- Modify: `src/server/email/templates.ts`
- Test: `src/server/email/templates.test.ts`

**Interfaces:**
- Produces: `function knockoutAssignedEmail(assigned: Array<{ stage: string; homeCode: string; awayCode: string }>, anomalies: string[], appUrl: string): EmailContent`

- [ ] **Step 1: Escribir el test fallido** (añadir a `src/server/email/templates.test.ts`)

```ts
import { knockoutAssignedEmail } from './templates';

describe('correo de auto-asignación de eliminatoria', () => {
  it('lista cruces y enlaza a la app cuando hay asignaciones', () => {
    const { subject, html } = knockoutAssignedEmail(
      [{ stage: 'R16', homeCode: 'MEX', awayCode: 'ECU' }],
      [],
      'https://quiniela.example',
    );
    expect(subject).toContain('1');
    expect(html).toContain('MEX');
    expect(html).toContain('ECU');
    expect(html).toContain('Octavos');
    expect(html).toContain('href="https://quiniela.example/partidos"');
    expect(html).toContain('QUINIELA DEL BIENESTAR');
  });

  it('incluye las anomalías cuando las hay', () => {
    const { subject, html } = knockoutAssignedEmail([], ['R16: código desconocido "ZZZ".'], 'https://quiniela.example');
    expect(subject.toLowerCase()).toContain('revisa');
    expect(html).toContain('ZZZ');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm exec vitest run src/server/email/templates.test.ts`
Expected: FAIL (`knockoutAssignedEmail` no existe).

- [ ] **Step 3: Implementar** (añadir al final de `src/server/email/templates.ts`)

```ts
const STAGE_LABEL: Record<string, string> = {
  R32: 'Dieciseisavos',
  R16: 'Octavos',
  QF: 'Cuartos',
  SF: 'Semifinales',
  FIN: 'Final',
};

export function knockoutAssignedEmail(
  assigned: Array<{ stage: string; homeCode: string; awayCode: string }>,
  anomalies: string[],
  appUrl: string,
): EmailContent {
  const rows = assigned
    .map(
      (a) =>
        `<tr><td style="color:#6f6b64;font-size:12px;letter-spacing:1px;padding:6px 12px 6px 0;">${STAGE_LABEL[a.stage] ?? a.stage}</td>` +
        `<td style="color:#f2f1ee;font-size:15px;font-weight:bold;padding:6px 0;">${a.homeCode} vs ${a.awayCode}</td></tr>`,
    )
    .join('');
  const assignedBlock = assigned.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">${rows}</table>`
    : `<p style="color:#a39f98;font-size:15px;">No se asignaron cruces nuevos.</p>`;
  const anomaliesBlock = anomalies.length
    ? `<p style="color:#e0a106;font-size:14px;font-weight:bold;padding-top:16px;">⚠️ Revisa en Admin:</p>` +
      `<ul style="color:#a39f98;font-size:13px;text-align:left;line-height:1.6;">${anomalies.map((x) => `<li>${x}</li>`).join('')}</ul>`
    : '';
  const subject = assigned.length
    ? `⚽ ${assigned.length} cruce(s) de eliminatoria asignados`
    : '⚠️ Revisa la auto-asignación de eliminatoria';

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#121212;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="background:#1d1d1c;border:1px solid #2c2c2a;border-radius:8px;padding:32px;">
        <tr><td align="center" style="padding-bottom:8px;">
          <span style="color:#4db53c;font-size:13px;letter-spacing:3px;font-weight:bold;">QUINIELA DEL BIENESTAR</span>
        </td></tr>
        <tr><td align="center" style="color:#f2f1ee;font-size:22px;font-weight:bold;padding:8px 0;">Eliminatoria actualizada</td></tr>
        <tr><td align="center" style="padding:8px 0 16px;">${assignedBlock}${anomaliesBlock}</td></tr>
        <tr><td align="center">
          <a href="${appUrl}/partidos" style="background:#4db53c;color:#ffffff;text-decoration:none;font-weight:bold;
             padding:14px 28px;border-radius:4px;display:inline-block;letter-spacing:1px;">VER EL CUADRO</a>
        </td></tr>
        <tr><td align="center" style="color:#6f6b64;font-size:12px;line-height:1.6;padding-top:24px;">
          Asignación automática desde football-data.org · Copa Mundial 2026
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
  return { subject, html };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm exec vitest run src/server/email/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/email/templates.ts src/server/email/templates.test.ts
git commit -m "feat(email): plantilla de aviso de auto-asignación de eliminatoria"
```

---

### Task 5: Orquestación `runFullSync`

**Files:**
- Modify: `src/server/services/sync.ts`
- Test: `src/server/services/sync.test.ts`

**Interfaces:**
- Consumes: `EmailSender` de `@/server/email/sender`; `knockoutAssignedEmail` de `@/server/email/templates`; todo lo anterior de `sync.ts`.
- Produces:
  - `interface FullSyncDeps { provider: ResultsProvider; syncRepo: SyncRepo; assignRepo: KnockoutAssignRepo; sender: EmailSender; adminEmails: string[]; appUrl: string }`
  - `interface FullSyncSummary { sync: SyncSummary; assign: KnockoutAssignResult }`
  - `function runFullSync(deps: FullSyncDeps, now?: Date): Promise<FullSyncSummary>`

- [ ] **Step 1: Escribir el test fallido** (añadir a `src/server/services/sync.test.ts`; agrega `runFullSync`, `type FullSyncDeps` al import de `./sync`, y `type ProviderRawMatch` ya está)

```ts
import { runFullSync, type FullSyncDeps } from './sync';
import type { EmailSender } from '@/server/email/sender';

function fakeSender() {
  const sent: Array<{ to: string; subject: string }> = [];
  const sender: EmailSender = {
    async send(to, subject) {
      sent.push({ to, subject });
    },
  };
  return { sender, sent };
}

function buildDeps(over: Partial<FullSyncDeps>, sender: EmailSender): FullSyncDeps {
  return {
    provider: { async fetchAll() { return []; } },
    syncRepo: { async getSyncableMatches() { return []; }, async setResult() {} },
    assignRepo: {
      async getKnockoutLlaves() { return []; },
      async getKnownTeamCodes() { return new Set(); },
      async assignTeams() {},
    },
    sender,
    adminEmails: ['admin@demo.mx'],
    appUrl: 'https://quiniela.example',
    ...over,
  };
}

describe('runFullSync', () => {
  const now = new Date('2026-06-28T10:00:00Z');

  it('asigna cruces KO nuevos y manda correo al admin', async () => {
    const { sender, sent } = fakeSender();
    const raw: ProviderRawMatch[] = [
      {
        utcDate: '2026-06-28T18:30:00Z',
        status: 'TIMED',
        stage: 'LAST_32',
        homeTeam: { tla: 'ESP' },
        awayTeam: { tla: 'URU' },
        score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
      },
    ];
    const writes: number[] = [];
    const deps = buildDeps(
      {
        provider: { async fetchAll() { return raw; } },
        assignRepo: {
          async getKnockoutLlaves() {
            return [{ id: 73, stage: 'R32', tag: null, homeCode: null, awayCode: null, kickoffUtc: new Date('2026-06-28T17:00:00Z') }];
          },
          async getKnownTeamCodes() { return new Set(['ESP', 'URU']); },
          async assignTeams(id) { writes.push(id); },
        },
      },
      sender,
    );
    const summary = await runFullSync(deps, now);
    expect(writes).toEqual([73]);
    expect(summary.assign.assigned).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('admin@demo.mx');
  });

  it('no manda correo cuando no hay novedades ni anomalías', async () => {
    const { sender, sent } = fakeSender();
    const summary = await runFullSync(buildDeps({}, sender), now);
    expect(summary.assign.assigned).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('un fallo de la auto-asignación no rompe el sync de goles', async () => {
    const { sender } = fakeSender();
    const deps = buildDeps(
      {
        assignRepo: {
          async getKnockoutLlaves() { throw new Error('boom'); },
          async getKnownTeamCodes() { return new Set(); },
          async assignTeams() {},
        },
      },
      sender,
    );
    const summary = await runFullSync(deps, now);
    expect(summary.sync.remoteFinished).toBe(0); // el sync corrió igual
    expect(summary.assign.anomalies.some((a) => a.includes('boom'))).toBe(true);
  });

  it('un fallo de Resend no rompe el sync', async () => {
    const failing: EmailSender = { async send() { throw new Error('resend down'); } };
    const raw: ProviderRawMatch[] = [
      {
        utcDate: '2026-06-28T18:30:00Z',
        status: 'TIMED',
        stage: 'LAST_32',
        homeTeam: { tla: 'ESP' },
        awayTeam: { tla: 'URU' },
        score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
      },
    ];
    const deps = buildDeps(
      {
        provider: { async fetchAll() { return raw; } },
        assignRepo: {
          async getKnockoutLlaves() {
            return [{ id: 73, stage: 'R32', tag: null, homeCode: null, awayCode: null, kickoffUtc: new Date('2026-06-28T17:00:00Z') }];
          },
          async getKnownTeamCodes() { return new Set(['ESP', 'URU']); },
          async assignTeams() {},
        },
      },
      failing,
    );
    const summary = await runFullSync(deps, now); // no debe lanzar
    expect(summary.assign.assigned).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm exec vitest run src/server/services/sync.test.ts`
Expected: FAIL (`runFullSync` no existe).

- [ ] **Step 3: Implementar** en `src/server/services/sync.ts`. Añade los imports y el bloque (antes de `getResultsProvider`).

Añadir imports al inicio:

```ts
import type { EmailSender } from '@/server/email/sender';
import { knockoutAssignedEmail } from '@/server/email/templates';
```

Añadir:

```ts
// --- Orquestación: goles + asignación + aviso -----------------------------

export interface FullSyncDeps {
  provider: ResultsProvider;
  syncRepo: SyncRepo;
  assignRepo: KnockoutAssignRepo;
  sender: EmailSender;
  adminEmails: string[];
  appUrl: string;
}

export interface FullSyncSummary {
  sync: SyncSummary;
  assign: KnockoutAssignResult;
}

export async function runFullSync(deps: FullSyncDeps, now: Date = new Date()): Promise<FullSyncSummary> {
  const all = await deps.provider.fetchAll();

  // Goles (sin cambios respecto a hoy).
  const sync = await runSync(deps.syncRepo, selectFinished(all));

  // Asignación KO, aislada: su fallo no rompe los goles.
  let assign: KnockoutAssignResult = { assigned: [], anomalies: [] };
  try {
    assign = await runKnockoutAutoAssign(deps.assignRepo, selectKnockoutFixtures(all), now);
  } catch (e) {
    assign = { assigned: [], anomalies: [`Fallo en auto-asignación: ${e instanceof Error ? e.message : 'error'}`] };
  }

  // Aviso best-effort: solo si hubo novedades o anomalías; su fallo no rompe el sync.
  if ((assign.assigned.length > 0 || assign.anomalies.length > 0) && deps.adminEmails.length > 0) {
    try {
      const { subject, html } = knockoutAssignedEmail(assign.assigned, assign.anomalies, deps.appUrl);
      await deps.sender.send(deps.adminEmails.join(', '), subject, html);
    } catch (e) {
      console.error('No se pudo enviar el aviso de auto-asignación:', e);
    }
  }

  return { sync, assign };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm exec vitest run src/server/services/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sync.ts src/server/services/sync.test.ts
git commit -m "feat(sync): runFullSync orquesta goles + auto-asignación + aviso"
```

---

### Task 6: Conectar `runFullSync` al endpoint, la action y el Admin

**Files:**
- Modify: `src/app/api/sync/route.ts`
- Modify: `src/app/actions/results.ts`
- Modify: `src/components/admin/AdminScreen.tsx`

**Interfaces:**
- Consumes: `runFullSync`, `prismaSyncRepo`, `prismaKnockoutAssignRepo`, `getResultsProvider`, `type FullSyncSummary`, `type KnockoutAssignResult` de `@/server/services/sync`; `getEmailSender` de `@/server/email/sender`; `env`.

- [ ] **Step 1: Actualizar el endpoint** — reemplazar el cuerpo del `try` en `src/app/api/sync/route.ts`

Reemplazar los imports de `@/server/services/sync` por:

```ts
import {
  getResultsProvider,
  prismaSyncRepo,
  prismaKnockoutAssignRepo,
  runFullSync,
} from '@/server/services/sync';
```

Añadir imports:

```ts
import { getEmailSender } from '@/server/email/sender';
```

Reemplazar el bloque que hoy hace `const summary = await runSync(prismaSyncRepo(db), await provider.fetchFinished());` por:

```ts
    const summary = await runFullSync({
      provider,
      syncRepo: prismaSyncRepo(db),
      assignRepo: prismaKnockoutAssignRepo(db),
      sender: getEmailSender(),
      adminEmails: env.adminEmails,
      appUrl: env.appUrl,
    });
    revalidatePath('/partidos');
    revalidatePath('/tabla');
    revalidatePath('/resultados');
    return NextResponse.json(summary);
```

> `env` ya está importado en el archivo. Verifica que el `import { env } from '@/server/env';` siga presente.

- [ ] **Step 2: Actualizar `syncNowAction`** en `src/app/actions/results.ts`

Reemplazar el import de `@/server/services/sync` por:

```ts
import {
  getResultsProvider,
  prismaSyncRepo,
  prismaKnockoutAssignRepo,
  runFullSync,
  type FullSyncSummary,
} from '@/server/services/sync';
```

Añadir imports al inicio:

```ts
import { env } from '@/server/env';
import { getEmailSender } from '@/server/email/sender';
```

Cambiar `ResultActionResult` para incluir el resumen completo:

```ts
export interface ResultActionResult {
  ok?: boolean;
  error?: string;
  sync?: FullSyncSummary;
}
```

Reemplazar el cuerpo de `syncNowAction` por:

```ts
export async function syncNowAction(): Promise<ResultActionResult> {
  try {
    await requireAdmin();
    const provider = getResultsProvider();
    if (!provider) {
      return { error: 'Configura FOOTBALL_DATA_TOKEN para sincronizar; mientras, captura manual.' };
    }
    const summary = await runFullSync({
      provider,
      syncRepo: prismaSyncRepo(db),
      assignRepo: prismaKnockoutAssignRepo(db),
      sender: getEmailSender(),
      adminEmails: env.adminEmails,
      appUrl: env.appUrl,
    });
    refreshAll();
    return { ok: true, sync: summary };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    return { error: `No se pudo sincronizar: ${e instanceof Error ? e.message : 'error desconocido'}` };
  }
}
```

- [ ] **Step 3: Mostrar el resumen en el Admin** — en `src/components/admin/AdminScreen.tsx`

Cambiar el import de tipo:

```ts
import type { FullSyncSummary } from '@/server/services/sync';
```

Cambiar el estado del resumen:

```ts
  const [summary, setSummary] = useState<FullSyncSummary | null>(null);
```

Y en `syncNow`, `setSummary(res.sync)` ya recibe el `FullSyncSummary`. Reemplazar el bloque que renderiza `summary` (el `{summary ? (... summary.remoteFinished ...)}`) por:

```tsx
        {summary ? (
          summary.sync.remoteFinished === 0 && summary.assign.assigned.length === 0 ? (
            <span className="sync-summary">
              ⏳ Nada nuevo: football-data aún no reporta resultados ni cruces. La sincronización corre
              cada 15 min; también puedes capturar a mano.
            </span>
          ) : (
            <span className="sync-summary">
              ✓ {summary.sync.updated} marcadores · {summary.sync.skippedManual} respetados ·{' '}
              {summary.assign.assigned.length} llaves asignadas
              {summary.assign.anomalies.length ? ` · ⚠️ ${summary.assign.anomalies.length} anomalías` : ''}
            </span>
          )
        ) : null}
```

- [ ] **Step 4: Typecheck y suite completa**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: tsc exit 0; todos los tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sync/route.ts src/app/actions/results.ts src/components/admin/AdminScreen.tsx
git commit -m "feat(sync): conecta runFullSync al cron, la action y el Admin"
```

---

## Verificación final (manual)

1. **Botón de admin (prod):** abre Admin → "⟳ Sincronizar". Debe correr goles + auto-asignación y mostrar el resumen. Si la siguiente ronda ya está en football-data, sus llaves se llenan y llega correo.
2. **Cron:** la GitHub Action de 15 min ya pega a `/api/sync`; tras el deploy, octavos se llenará solo cuando football-data lo publique.
3. **Idempotencia:** correr el sync dos veces no reasigna ni reescribe (segunda vez: 0 llaves asignadas, sin correo).
4. **Break-glass:** `pnpm exec tsx --env-file=.env scripts/assign-knockout.ts` (DRY-RUN) sigue funcionando para forzar a mano.

## Notas de despliegue

- Requiere `FOOTBALL_DATA_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAILS`, `APP_URL` en Render (ya configurados salvo confirmación).
- ⚠️ Resend sandbox: el aviso solo llega a la dirección dueña de la cuenta hasta verificar dominio.
- El push a `main` dispara el redeploy que activa este comportamiento.
