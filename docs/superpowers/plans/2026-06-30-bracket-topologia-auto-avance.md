# Topología del cuadro + auto-avance — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cuadro KO sea congruente con el torneo real (líneas correctas) y que octavos→final se llenen solos al salir cada ganador, mediante una topología verificada del Mundial 2026.

**Architecture:** Un módulo puro `bracket-topology.ts` codifica el árbol NO-consecutivo (verificado con 6 fuentes) por identidad de equipos. El auto-avance escribe el ganador de cada llave en el casillero del padre (idempotente, conservador con picks). El display se ordena por rango de bracket. El proveedor pasa a traer solo goles + kickoff real de R16+; deja de sembrar R16+. Sin migración: R16–104 están vacíos.

**Tech Stack:** TypeScript, Next.js (App Router, server actions), Prisma, Vitest, React (prototipo por CDN en JS plano).

## Global Constraints

- Gestor de paquetes: **pnpm** (no npm). Tests: `pnpm test` (Vitest). Lint/build: `pnpm build`.
- **TDD**: test que falla → implementación mínima → verde → commit. Commits frecuentes.
- Sin cambios al **esquema de Prisma** ni a la **lógica de puntaje**.
- Datos 2026 **hardcodeados a propósito** (YAGNI; no abstraer a "torneo genérico").
- Códigos de equipo = tabla `TEAMS` de `src/data/worldcup2026.ts` (RSA, CAN, NED, MAR, GER, PAR, FRA, SWE, BRA, JPN, CIV, NOR, MEX, ECU, ENG, COD, USA, BIH, BEL, SEN, POR, CRO, ESP, AUT, SUI, ALG, ARG, CPV, COL, GHA, AUS, EGY).
- Numeración de partido = FIFA: R32=73–88, R16=89–96, QF=97–100, SF=101–102, 3.º=103, Final=104. **En la app, las filas R16–104 (ids 89–104) equivalen al slot Esquema X**; R32 (ids del app) se resuelve por par de equipos.
- **Árbol verificado (NO consecutivo):** `89=[74,77] 90=[73,75] 91=[76,78] 92=[79,80] 93=[83,84] 94=[81,82] 95=[86,88] 96=[85,87]`; `97=[89,90] 98=[93,94] 99=[91,92] 100=[95,96]`; `101=[97,98] 102=[99,100]`; final `104=[G101,G102]`; 3.º `103=[P101,P102]`. Primer feeder → local (H).
- **Ancla (test obligatorio):** Canadá (slot 73) y Marruecos (slot 75) → ambos a octavos **90**.

---

### Task 0: Diagnóstico del estado real de la DB (read-only)

**Contexto:** El diseño (spec §7) asume R16–104 vacíos. Hay que **confirmarlo contra la DB de producción** antes de construir el reset. Este script es solo-lectura.

> ⚠️ **Requiere luz verde del usuario** para correr contra la DB de producción (usa `.env`). No escribe nada.

**Files:**
- Create: `scripts/inspect-knockout-state.ts`

- [ ] **Step 1: Escribir el script de diagnóstico**

```ts
// scripts/inspect-knockout-state.ts
// READ-ONLY: reporta el estado de las llaves KO (equipos, resultados, #picks) por ronda.
// Uso: pnpm exec tsx --env-file=.env scripts/inspect-knockout-state.ts
import { db } from '../src/server/db';

async function main() {
  const rows = await db.match.findMany({
    where: { isKnockout: true },
    select: {
      id: true, stage: true, tag: true, homeCode: true, awayCode: true,
      homeGoals: true, awayGoals: true, penWinner: true, kickoffUtc: true,
      _count: { select: { picks: true } },
    },
    orderBy: { id: 'asc' },
  });
  for (const m of rows) {
    const teams = m.homeCode && m.awayCode ? `${m.homeCode}-${m.awayCode}` : '(vacío)';
    const res = m.homeGoals !== null ? `${m.homeGoals}-${m.awayGoals}${m.penWinner ? ' pen:' + m.penWinner : ''}` : '—';
    console.log(`#${m.id} [${m.stage}] ${teams.padEnd(10)} res:${res.padEnd(8)} picks:${m._count.picks}  ${m.kickoffUtc.toISOString()}`);
  }
  const r16plus = rows.filter((m) => ['R16', 'QF', 'SF', 'FIN'].includes(m.stage));
  const poblados = r16plus.filter((m) => m.homeCode || m.awayCode);
  const conPicks = r16plus.filter((m) => m._count.picks > 0);
  console.log(`\nR16+: ${r16plus.length} llaves · ${poblados.length} con equipos · ${conPicks.length} con picks`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
```

- [ ] **Step 2: (con aprobación del usuario) correr y anotar el resultado**

Run: `pnpm exec tsx --env-file=.env scripts/inspect-knockout-state.ts`
Expected: lista de llaves; anotar cuántas R16+ están pobladas y si alguna tiene picks. Si alguna R16+ tiene picks → tratar como caso manual (spec §7/§9) antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add scripts/inspect-knockout-state.ts
git commit -m "chore(bracket): script read-only para inspeccionar estado KO"
```

---

### Task 1: Módulo de topología — datos + funciones puras

**Files:**
- Create: `src/domain/bracket-topology.ts`
- Test: `src/domain/bracket-topology.test.ts`

**Interfaces:**
- Produces: `R32_TEAMS`, `FEEDERS`, `THIRD_PLACE_ID`, `THIRD_PLACE_FEEDERS`, `DISPLAY_ORDER`, `r32SlotByTeams(a,b): number|null`, `winnerTarget(slot): {parentId,slot:'H'|'A'}|null`, `loserTarget(slot): {parentId,slot:'H'|'A'}|null`, `bracketRank(stage,slot): number`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/domain/bracket-topology.test.ts
import { describe, it, expect } from 'vitest';
import {
  r32SlotByTeams, winnerTarget, loserTarget, bracketRank, DISPLAY_ORDER, R32_TEAMS,
} from './bracket-topology';

describe('bracket-topology (datos verificados 2026)', () => {
  it('resuelve el slot R32 por par de equipos (orden-independiente)', () => {
    expect(r32SlotByTeams('CAN', 'RSA')).toBe(73);
    expect(r32SlotByTeams('RSA', 'CAN')).toBe(73);
    expect(r32SlotByTeams('MAR', 'NED')).toBe(75);
    expect(r32SlotByTeams('BRA', 'JPN')).toBe(76);
    expect(r32SlotByTeams('XXX', 'YYY')).toBeNull();
    expect(r32SlotByTeams(null, 'CAN')).toBeNull();
  });

  it('winnerTarget refleja el árbol no-consecutivo', () => {
    expect(winnerTarget(73)).toEqual({ parentId: 90, slot: 'H' });
    expect(winnerTarget(75)).toEqual({ parentId: 90, slot: 'A' });
    expect(winnerTarget(74)).toEqual({ parentId: 89, slot: 'H' });
    expect(winnerTarget(86)).toEqual({ parentId: 95, slot: 'H' });
    expect(winnerTarget(88)).toEqual({ parentId: 95, slot: 'A' });
    expect(winnerTarget(101)).toEqual({ parentId: 104, slot: 'H' });
    expect(winnerTarget(102)).toEqual({ parentId: 104, slot: 'A' });
    expect(winnerTarget(104)).toBeNull();
  });

  it('loserTarget solo aplica a semifinales → 3er lugar', () => {
    expect(loserTarget(101)).toEqual({ parentId: 103, slot: 'H' });
    expect(loserTarget(102)).toEqual({ parentId: 103, slot: 'A' });
    expect(loserTarget(90)).toBeNull();
  });

  it('bracketRank ordena por posición de bracket, no por id', () => {
    expect(bracketRank('R32', 74)).toBe(0);
    expect(bracketRank('R32', 73)).toBe(2);
    expect(bracketRank('R16', 90)).toBe(1);
    expect(bracketRank('QF', 99)).toBe(2);
    expect(bracketRank('SF', 102)).toBe(1);
    expect(bracketRank('R16', 999)).toBe(999);
  });

  it('DISPLAY_ORDER de R32 es partición limpia de los 16 slots', () => {
    const set = new Set(DISPLAY_ORDER.R32);
    expect(DISPLAY_ORDER.R32).toHaveLength(16);
    expect(set.size).toBe(16);
    for (const slot of Object.keys(R32_TEAMS)) expect(set.has(Number(slot))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test src/domain/bracket-topology.test.ts`
Expected: FAIL (`Cannot find module './bracket-topology'`).

- [ ] **Step 3: Escribir el módulo**

```ts
// src/domain/bracket-topology.ts
// Topología verificada del cuadro KO del Mundial 2026 (ver spec 2026-06-30 y
// memoria quiniela-bracket-topologia-2026). Datos 2026-específicos hardcodeados
// (YAGNI). El árbol NO es consecutivo (verificado con 6 fuentes).

// Slot oficial R32 (73-88, Esquema X/FIFA) → par de códigos de equipo.
export const R32_TEAMS: Record<number, readonly [string, string]> = {
  73: ['RSA', 'CAN'], 74: ['GER', 'PAR'], 75: ['NED', 'MAR'], 76: ['BRA', 'JPN'],
  77: ['FRA', 'SWE'], 78: ['CIV', 'NOR'], 79: ['MEX', 'ECU'], 80: ['ENG', 'COD'],
  81: ['USA', 'BIH'], 82: ['BEL', 'SEN'], 83: ['POR', 'CRO'], 84: ['ESP', 'AUT'],
  85: ['SUI', 'ALG'], 86: ['ARG', 'CPV'], 87: ['COL', 'GHA'], 88: ['AUS', 'EGY'],
};

// Padre → [feederA (→local/H), feederB (→visitante/A)]. Solo GANADOR (final 104
// incluida). El 3.º lugar (103) se maneja aparte con los perdedores de semis.
export const FEEDERS: Record<number, readonly [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  104: [101, 102],
};
export const THIRD_PLACE_ID = 103;
export const THIRD_PLACE_FEEDERS: readonly [number, number] = [101, 102]; // perdedores de semis

// Orden de display por columna (izquierda | derecha), 0-based.
export const DISPLAY_ORDER: Record<string, readonly number[]> = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
};

const pairKey = (a: string, b: string) => [a, b].slice().sort().join('|');

const R32_BY_PAIR = new Map<string, number>(
  Object.entries(R32_TEAMS).map(([slot, [a, b]]) => [pairKey(a, b), Number(slot)]),
);

const WINNER_PARENT = new Map<number, { parentId: number; slot: 'H' | 'A' }>();
for (const [parent, [a, b]] of Object.entries(FEEDERS)) {
  WINNER_PARENT.set(a, { parentId: Number(parent), slot: 'H' });
  WINNER_PARENT.set(b, { parentId: Number(parent), slot: 'A' });
}

/** Slot oficial R32 a partir del par de equipos (orden-independiente); null si no existe. */
export function r32SlotByTeams(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return R32_BY_PAIR.get(pairKey(a, b)) ?? null;
}

/** Casillero destino del GANADOR de `slot`; null si es final/3.º (sin padre). */
export function winnerTarget(slot: number): { parentId: number; slot: 'H' | 'A' } | null {
  return WINNER_PARENT.get(slot) ?? null;
}

/** Casillero destino del PERDEDOR; solo semifinales (101/102 → 3.º lugar). */
export function loserTarget(slot: number): { parentId: number; slot: 'H' | 'A' } | null {
  if (slot === THIRD_PLACE_FEEDERS[0]) return { parentId: THIRD_PLACE_ID, slot: 'H' };
  if (slot === THIRD_PLACE_FEEDERS[1]) return { parentId: THIRD_PLACE_ID, slot: 'A' };
  return null;
}

/** Rango de display (0-based) del slot en su columna; 999 si desconocido. */
export function bracketRank(stage: string, slot: number): number {
  const order = DISPLAY_ORDER[stage];
  if (!order) return 999;
  const i = order.indexOf(slot);
  return i < 0 ? 999 : i;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm test src/domain/bracket-topology.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bracket-topology.ts src/domain/bracket-topology.test.ts
git commit -m "feat(bracket): topología verificada 2026 (árbol no-consecutivo) + funciones puras"
```

---

### Task 2: `computeAdvancement` (auto-avance puro)

**Files:**
- Modify: `src/domain/bracket-topology.ts`
- Test: `src/domain/bracket-topology.test.ts`

**Interfaces:**
- Consumes: `r32SlotByTeams`, `winnerTarget`, `loserTarget`, `matchOutcome` (`./scoring`), `MatchResult` (`./types`).
- Produces: `slotOf(m)`, `computeAdvancement(matches: AdvanceInput[]): AdvanceResult` con `AdvanceInput`, `AdvanceWrite`, `AdvanceResult`.

- [ ] **Step 1: Escribir el test que falla (ancla incluida)**

```ts
// añadir a src/domain/bracket-topology.test.ts
import { computeAdvancement, type AdvanceInput } from './bracket-topology';

const r32 = (id: number, home: string, away: string, hg: number, ag: number, pen: 'H' | 'A' | null = null): AdvanceInput =>
  ({ id, stage: 'R32', homeCode: home, awayCode: away, isKnockout: true, result: { homeGoals: hg, awayGoals: ag, penWinner: pen } });

describe('computeAdvancement', () => {
  it('ANCLA: Canadá (73) y Marruecos (75) → mismo octavos 90', () => {
    const { writes, anomalies } = computeAdvancement([
      r32(9001, 'RSA', 'CAN', 0, 1), // Canadá gana → slot 73
      r32(9002, 'NED', 'MAR', 1, 1, 'A'), // Marruecos gana por penales → slot 75
    ]);
    expect(anomalies).toEqual([]);
    expect(writes).toContainEqual({ matchId: 90, slot: 'H', teamCode: 'CAN' });
    expect(writes).toContainEqual({ matchId: 90, slot: 'A', teamCode: 'MAR' });
  });

  it('empate KO sin ganador de penales no avanza', () => {
    const { writes } = computeAdvancement([r32(9003, 'BRA', 'JPN', 1, 1, null)]);
    expect(writes).toEqual([]);
  });

  it('semifinal manda ganador a la final y perdedor al 3.º', () => {
    const sf: AdvanceInput = { id: 101, stage: 'SF', homeCode: 'BRA', awayCode: 'FRA', isKnockout: true, result: { homeGoals: 2, awayGoals: 0, penWinner: null } };
    const { writes } = computeAdvancement([sf]);
    expect(writes).toContainEqual({ matchId: 104, slot: 'H', teamCode: 'BRA' });
    expect(writes).toContainEqual({ matchId: 103, slot: 'H', teamCode: 'FRA' });
  });

  it('R32 con equipos fuera del cuadro → anomalía', () => {
    const { anomalies } = computeAdvancement([r32(9004, 'XXX', 'YYY', 1, 0)]);
    expect(anomalies).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `pnpm test src/domain/bracket-topology.test.ts`
Expected: FAIL (`computeAdvancement` no existe).

- [ ] **Step 3: Implementar en el módulo**

```ts
// añadir a src/domain/bracket-topology.ts
import { matchOutcome } from './scoring';
import type { MatchResult } from './types';

export interface AdvanceInput {
  id: number;
  stage: string;
  isKnockout: boolean;
  homeCode: string | null;
  awayCode: string | null;
  result: MatchResult | null;
}
export interface AdvanceWrite { matchId: number; slot: 'H' | 'A'; teamCode: string }
export interface AdvanceResult { writes: AdvanceWrite[]; anomalies: string[] }

/** Slot oficial de un partido KO: R32 por contenido; R16+ por id (=slot X). */
export function slotOf(m: { id: number; stage: string; homeCode: string | null; awayCode: string | null }): number | null {
  if (m.stage === 'R32') return r32SlotByTeams(m.homeCode, m.awayCode);
  return m.id;
}

/** Deriva todos los casilleros R16+ que se pueden llenar desde los resultados actuales. */
export function computeAdvancement(matches: AdvanceInput[]): AdvanceResult {
  const writes: AdvanceWrite[] = [];
  const anomalies: string[] = [];
  for (const m of matches) {
    if (!m.result || !m.homeCode || !m.awayCode) continue;
    const out = matchOutcome(m.result, m.isKnockout);
    if (out !== 'H' && out !== 'A') continue; // empate KO sin penales → no avanza
    const slot = slotOf(m);
    if (slot === null) {
      anomalies.push(`R32 sin slot: ${m.homeCode} vs ${m.awayCode} (id ${m.id}) no está en el cuadro 2026.`);
      continue;
    }
    const winner = out === 'H' ? m.homeCode : m.awayCode;
    const loser = out === 'H' ? m.awayCode : m.homeCode;
    const wt = winnerTarget(slot);
    if (wt) writes.push({ matchId: wt.parentId, slot: wt.slot, teamCode: winner });
    const lt = loserTarget(slot);
    if (lt) writes.push({ matchId: lt.parentId, slot: lt.slot, teamCode: loser });
  }
  return { writes, anomalies };
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `pnpm test src/domain/bracket-topology.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/domain/bracket-topology.ts src/domain/bracket-topology.test.ts
git commit -m "feat(bracket): computeAdvancement (auto-avance puro por topología)"
```

---

### Task 3: `layout.ts` ordena por rango de bracket

**Files:**
- Modify: `src/components/matches/bracket/layout.ts:18-26` (`stageSide`)
- Test: `src/components/matches/bracket/layout.test.ts`

**Interfaces:**
- Consumes: `bracketRank`, `r32SlotByTeams` (de `@/domain/bracket-topology`), `MatchView` (`@/server/queries`).
- Produces: `stageSide` con misma firma, ahora ordenado por bracket.

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a src/components/matches/bracket/layout.test.ts
import { stageSide } from './layout';
import type { MatchView } from '@/server/queries';

const r16 = (id: number): MatchView => ({
  id, stage: 'R16', group: null, tag: `Octavos`, isKnockout: true,
  home: null, away: null, kickoffUtc: '2026-07-04T17:00:00Z',
  locked: false, result: null, outcome: null, myPick: null, myScore: null,
});
const r32 = (id: number, h: string, a: string): MatchView => ({
  id, stage: 'R32', group: null, tag: 'Llave', isKnockout: true,
  home: { code: h, name: h, flag: '' }, away: { code: a, name: a, flag: '' },
  kickoffUtc: '2026-06-28T19:00:00Z', locked: false, result: null, outcome: null, myPick: null, myScore: null,
});

describe('stageSide ordena por rango de bracket', () => {
  it('R16 se ordena [89,90,93,94] a la izquierda, no por id', () => {
    const ms = [96, 95, 94, 93, 92, 91, 90, 89].map(r16);
    expect(stageSide(ms, 'R16', 'L', 4).map((m) => m.id)).toEqual([89, 90, 93, 94]);
    expect(stageSide(ms, 'R16', 'R', 4).map((m) => m.id)).toEqual([91, 92, 95, 96]);
  });

  it('R32 se ordena por el par de equipos (contenido), no por id', () => {
    // ids arbitrarios; el orden lo decide el contenido (slots 74,77 arriba a la izquierda).
    const ms = [r32(701, 'RSA', 'CAN') /*73*/, r32(702, 'GER', 'PAR') /*74*/, r32(703, 'FRA', 'SWE') /*77*/, r32(704, 'NED', 'MAR') /*75*/];
    // izquierda arranca con slot 74 (GER/PAR) y 77 (FRA/SWE): ids 702, 703
    expect(stageSide(ms, 'R32', 'L', 8).slice(0, 2).map((m) => m.id)).toEqual([702, 703]);
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `pnpm test src/components/matches/bracket/layout.test.ts`
Expected: FAIL (orden actual es por id).

- [ ] **Step 3: Modificar `stageSide`**

Reemplazar el cuerpo actual (`layout.ts:18-26`) por:

```ts
import { bracketRank, r32SlotByTeams } from '@/domain/bracket-topology';

/** Rango de display de un partido: R32 por contenido (par de equipos), R16+ por id. */
function displayRank(m: MatchView): number {
  const slot = m.stage === 'R32' ? r32SlotByTeams(m.home?.code ?? null, m.away?.code ?? null) : m.id;
  return bracketRank(m.stage, slot ?? 999);
}

export function stageSide(
  matches: MatchView[],
  stage: string,
  side: 'L' | 'R',
  n: number,
): MatchView[] {
  const ms = matches.filter((m) => m.stage === stage).sort((a, b) => displayRank(a) - displayRank(b));
  return side === 'L' ? ms.slice(0, n) : ms.slice(n);
}
```

- [ ] **Step 4: Correr para verificar que pasa (y no rompe los tests existentes de layout)**

Run: `pnpm test src/components/matches/bracket/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/matches/bracket/layout.ts src/components/matches/bracket/layout.test.ts
git commit -m "feat(bracket): ordenar el cuadro por rango de bracket (árbol real)"
```

---

### Task 4: Servicio `runKnockoutAdvance` + repo

**Files:**
- Modify: `src/server/services/sync.ts` (agregar servicio + repo Prisma)
- Test: `src/server/services/sync.test.ts`

**Interfaces:**
- Consumes: `computeAdvancement`, `AdvanceInput` (`@/domain/bracket-topology`).
- Produces: `KnockoutAdvanceRepo`, `AdvanceDbMatch`, `KnockoutAdvanceResult`, `runKnockoutAdvance(repo): Promise<KnockoutAdvanceResult>`, `prismaKnockoutAdvanceRepo(db)`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a src/server/services/sync.test.ts
import { runKnockoutAdvance, type KnockoutAdvanceRepo, type AdvanceDbMatch } from './sync';

function fakeAdvanceRepo(rows: AdvanceDbMatch[]) {
  const writes: Array<{ matchId: number; slot: 'H' | 'A'; teamCode: string }> = [];
  const repo: KnockoutAdvanceRepo = {
    async getKnockoutMatches() { return rows; },
    async setSlotTeam(matchId, slot, teamCode) {
      writes.push({ matchId, slot, teamCode });
      const t = rows.find((r) => r.id === matchId)!;
      if (slot === 'H') t.homeCode = teamCode; else t.awayCode = teamCode;
    },
  };
  return { repo, writes };
}

const R32 = (id: number, h: string, a: string, hg: number, ag: number, pen: 'H' | 'A' | null = null): AdvanceDbMatch =>
  ({ id, stage: 'R32', isKnockout: true, homeCode: h, awayCode: a, homeGoals: hg, awayGoals: ag, penWinner: pen, hasPicks: false });
const EMPTY = (id: number, stage: string): AdvanceDbMatch =>
  ({ id, stage, isKnockout: true, homeCode: null, awayCode: null, homeGoals: null, awayGoals: null, penWinner: null, hasPicks: false });

describe('runKnockoutAdvance', () => {
  it('llena octavos 90 con Canadá y Marruecos', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1), R32(704, 'NED', 'MAR', 1, 1, 'A'), EMPTY(90, 'R16'),
    ]);
    const res = await runKnockoutAdvance(repo);
    expect(res.anomalies).toEqual([]);
    expect(writes).toContainEqual({ matchId: 90, slot: 'H', teamCode: 'CAN' });
    expect(writes).toContainEqual({ matchId: 90, slot: 'A', teamCode: 'MAR' });
  });

  it('es idempotente: no re-escribe un casillero ya correcto', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1),
      { ...EMPTY(90, 'R16'), homeCode: 'CAN' }, // ya tiene CAN en H
    ]);
    await runKnockoutAdvance(repo);
    expect(writes).toEqual([]);
  });

  it('no pisa un casillero con OTRO equipo si ya tiene picks → anomalía', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1),
      { ...EMPTY(90, 'R16'), homeCode: 'BRA', hasPicks: true },
    ]);
    const res = await runKnockoutAdvance(repo);
    expect(writes).toEqual([]);
    expect(res.anomalies).toHaveLength(1);
  });

  it('sobrescribe casillero stale (otro equipo, SIN picks ni resultado)', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1),
      { ...EMPTY(90, 'R16'), homeCode: 'BRA' }, // stale del proveedor, sin picks
    ]);
    await runKnockoutAdvance(repo);
    expect(writes).toContainEqual({ matchId: 90, slot: 'H', teamCode: 'CAN' });
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `pnpm test src/server/services/sync.test.ts`
Expected: FAIL (`runKnockoutAdvance` no existe).

- [ ] **Step 3: Implementar en `sync.ts`**

```ts
// añadir a src/server/services/sync.ts
import { computeAdvancement, type AdvanceInput } from '@/domain/bracket-topology';

export interface AdvanceDbMatch {
  id: number; stage: string; isKnockout: boolean;
  homeCode: string | null; awayCode: string | null;
  homeGoals: number | null; awayGoals: number | null; penWinner: 'H' | 'A' | null;
  hasPicks: boolean;
}
export interface KnockoutAdvanceRepo {
  getKnockoutMatches(): Promise<AdvanceDbMatch[]>;
  setSlotTeam(matchId: number, slot: 'H' | 'A', teamCode: string): Promise<void>;
}
export interface KnockoutAdvanceResult {
  advanced: Array<{ matchId: number; slot: 'H' | 'A'; teamCode: string }>;
  anomalies: string[];
}

// Conservador: llena/actualiza casilleros R16+ derivados; nunca pisa uno con
// picks/resultado y equipo distinto (eso es anomalía). Idempotente.
export async function runKnockoutAdvance(repo: KnockoutAdvanceRepo): Promise<KnockoutAdvanceResult> {
  const rows = await repo.getKnockoutMatches();
  const inputs: AdvanceInput[] = rows.map((m) => ({
    id: m.id, stage: m.stage, isKnockout: m.isKnockout, homeCode: m.homeCode, awayCode: m.awayCode,
    result: m.homeGoals !== null && m.awayGoals !== null
      ? { homeGoals: m.homeGoals, awayGoals: m.awayGoals, penWinner: m.penWinner } : null,
  }));
  const { writes, anomalies } = computeAdvancement(inputs);
  const byId = new Map(rows.map((m) => [m.id, m]));
  const advanced: KnockoutAdvanceResult['advanced'] = [];

  for (const w of writes) {
    const target = byId.get(w.matchId);
    if (!target) { anomalies.push(`Destino ${w.matchId} no existe.`); continue; }
    const current = w.slot === 'H' ? target.homeCode : target.awayCode;
    if (current === w.teamCode) continue; // idempotente
    if (current !== null) {
      const hasResult = target.homeGoals !== null;
      if (target.hasPicks || hasResult) {
        anomalies.push(`m${w.matchId} lado ${w.slot}: topología dice ${w.teamCode} pero ya hay ${current} con picks/resultado — revisa Admin.`);
        continue;
      }
      // stale (sembrado por proveedor sin picks) → se sobrescribe
    }
    await repo.setSlotTeam(w.matchId, w.slot, w.teamCode);
    if (w.slot === 'H') target.homeCode = w.teamCode; else target.awayCode = w.teamCode;
    advanced.push(w);
  }
  return { advanced, anomalies };
}

export function prismaKnockoutAdvanceRepo(db: import('@prisma/client').PrismaClient): KnockoutAdvanceRepo {
  return {
    async getKnockoutMatches() {
      const rows = await db.match.findMany({
        where: { isKnockout: true },
        select: {
          id: true, stage: true, isKnockout: true, homeCode: true, awayCode: true,
          homeGoals: true, awayGoals: true, penWinner: true, _count: { select: { picks: true } },
        },
      });
      return rows.map(({ _count, ...r }) => ({ ...r, stage: r.stage as string, hasPicks: _count.picks > 0 }));
    },
    async setSlotTeam(matchId, slot, teamCode) {
      await db.match.update({ where: { id: matchId }, data: slot === 'H' ? { homeCode: teamCode } : { awayCode: teamCode } });
    },
  };
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `pnpm test src/server/services/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sync.ts src/server/services/sync.test.ts
git commit -m "feat(bracket): runKnockoutAdvance — llena R16+ desde resultados (conservador)"
```

---

### Task 5: Adopción de kickoff real + reconciliación con el proveedor

**Files:**
- Modify: `src/server/services/sync.ts`
- Test: `src/server/services/sync.test.ts`

**Interfaces:**
- Consumes: `ProviderFixture` (`@/domain/knockout-assign`), `mapFdStage`.
- Produces: `planKnockoutReconcile(rows, fixtures): { kickoffUpdates, anomalies }` (puro), consumido por `runFullSync`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a src/server/services/sync.test.ts
import { planKnockoutReconcile } from './sync';

const fx = (stage: string, home: string, away: string, utc: string) =>
  ({ utcDate: utc, stage, homeTeam: { tla: home, name: home }, awayTeam: { tla: away, name: away } });

describe('planKnockoutReconcile', () => {
  const rows = [
    { id: 90, stage: 'R16', homeCode: 'CAN', awayCode: 'MAR', kickoffUtc: new Date('2026-07-04T00:00:00Z') },
  ];
  it('adopta el kickoff real del proveedor cuando los equipos coinciden (orden-indep.)', () => {
    const r = planKnockoutReconcile(rows, [fx('LAST_16', 'MAR', 'CAN', '2026-07-04T21:00:00Z')]);
    expect(r.kickoffUpdates).toEqual([{ matchId: 90, utc: new Date('2026-07-04T21:00:00Z') }]);
    expect(r.anomalies).toEqual([]);
  });
  it('no reporta anomalía si el kickoff ya coincide', () => {
    const same = [{ ...rows[0], kickoffUtc: new Date('2026-07-04T21:00:00Z') }];
    const r = planKnockoutReconcile(same, [fx('LAST_16', 'CAN', 'MAR', '2026-07-04T21:00:00Z')]);
    expect(r.kickoffUpdates).toEqual([]);
  });
  it('flag de anomalía si el proveedor publica un cruce R16+ que no cuadra con la topología', () => {
    const r = planKnockoutReconcile(rows, [fx('LAST_16', 'CAN', 'BRA', '2026-07-04T21:00:00Z')]);
    expect(r.anomalies.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `pnpm test src/server/services/sync.test.ts`
Expected: FAIL (`planKnockoutReconcile` no existe).

- [ ] **Step 3: Implementar en `sync.ts`**

```ts
// añadir a src/server/services/sync.ts
const R16_PLUS = new Set(['R16', 'QF', 'SF', 'FIN']);
const setKey = (a: string, b: string) => [a, b].slice().sort().join('|');

export interface ReconcileRow {
  id: number; stage: string; homeCode: string | null; awayCode: string | null; kickoffUtc: Date;
}
export interface KnockoutReconcilePlan {
  kickoffUpdates: Array<{ matchId: number; utc: Date }>;
  anomalies: string[];
}

// Red de seguridad: el proveedor sigue publicando cruces R16+. No los usamos para
// llenar (eso lo hace el auto-avance), pero SÍ para (a) adoptar el kickoff real y
// (b) avisar si un cruce del proveedor no cuadra con lo que derivó la topología.
export function planKnockoutReconcile(rows: ReconcileRow[], fixtures: ProviderFixture[]): KnockoutReconcilePlan {
  const kickoffUpdates: KnockoutReconcilePlan['kickoffUpdates'] = [];
  const anomalies: string[] = [];
  const ours = rows.filter((r) => R16_PLUS.has(r.stage) && r.homeCode && r.awayCode);
  const byPair = new Map(ours.map((r) => [setKey(r.homeCode!, r.awayCode!), r]));

  for (const f of fixtures) {
    const ourStage = mapFdStage(f.stage);
    if (!ourStage || !R16_PLUS.has(ourStage)) continue;
    const home = f.homeTeam?.tla, away = f.awayTeam?.tla;
    if (!home || !away) continue;
    const match = byPair.get(setKey(home, away));
    if (match) {
      const utc = new Date(f.utcDate);
      if (utc.getTime() !== match.kickoffUtc.getTime()) kickoffUpdates.push({ matchId: match.id, utc });
    } else {
      // El proveedor publica este cruce pero no lo tenemos igual en R16+.
      const placed = ours.filter((r) => r.homeCode === home || r.awayCode === home || r.homeCode === away || r.awayCode === away);
      if (placed.length > 0) {
        anomalies.push(`${ourStage}: el proveedor publica ${home} vs ${away} que no cuadra con la topología — revisa Admin.`);
      }
    }
  }
  return { kickoffUpdates, anomalies };
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `pnpm test src/server/services/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/sync.ts src/server/services/sync.test.ts
git commit -m "feat(bracket): reconciliación con proveedor (adopta kickoff R16+, avisa diferencias)"
```

---

### Task 6: Integrar en `runFullSync` (R32-only assign + advance + reconcile)

**Files:**
- Modify: `src/server/services/sync.ts` (`runFullSync`, `FullSyncDeps`, `FullSyncSummary`)
- Modify: `src/app/actions/results.ts:86-93` y `src/app/api/sync/route.ts` (construir deps nuevas)
- Test: `src/server/services/sync.test.ts`

**Interfaces:**
- Consumes: `runKnockoutAdvance`, `planKnockoutReconcile`, `runKnockoutAutoAssign`.
- Produces: `runFullSync` que ahora (1) siembra **solo R32**, (2) corre auto-avance, (3) reconcilia + adopta kickoff.

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a src/server/services/sync.test.ts — extiende el test existente de runFullSync
// Verifica: selectKnockoutFixtures se filtra a R32 para el assign; y que runFullSync
// invoca advance + reconcile con las deps nuevas y agrega sus resultados al summary.
it('runFullSync solo auto-asigna R32 y corre el auto-avance', async () => {
  const advanceRepo = /* fake KnockoutAdvanceRepo que registra setSlotTeam */;
  const reconcileRepo = /* fake que registra updateKickoff */;
  // ... construir deps con provider fake que devuelve un R32 finalizado y su cruce
  // Aserción: summary.advance.advanced no vacío; assign no toca R16+.
});
```

> Nota para el implementador: reusar el patrón de fakes del test existente de `runFullSync` en este archivo (repos falsos + provider falso). El objetivo es (a) que `runKnockoutAutoAssign` reciba solo fixtures R32, (b) que `runKnockoutAdvance` y `planKnockoutReconcile` se ejecuten, (c) que sus salidas entren en `FullSyncSummary`.

- [ ] **Step 2: Correr para verificar que falla**

Run: `pnpm test src/server/services/sync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modificar `runFullSync` y las deps**

En `sync.ts`, ampliar `FullSyncDeps` con `advanceRepo: KnockoutAdvanceRepo` y `reconcileRepo` (lecturas R16+ + `updateKickoff`), y `FullSyncSummary` con `advance` y `reconcile`. Filtrar los fixtures del assign a R32:

```ts
// dentro de runFullSync, reemplazar el bloque de asignación:
const koFixtures = selectKnockoutFixtures(all);
const r32Fixtures = koFixtures.filter((f) => mapFdStage(f.stage) === 'R32');

let assign: KnockoutAssignResult = { assigned: [], anomalies: [] };
try { assign = await runKnockoutAutoAssign(deps.assignRepo, r32Fixtures, now); }
catch (e) { assign = { assigned: [], anomalies: [`Fallo en auto-asignación R32: ${msg(e)}`] }; }

let advance: KnockoutAdvanceResult = { advanced: [], anomalies: [] };
try { advance = await runKnockoutAdvance(deps.advanceRepo); }
catch (e) { advance = { advanced: [], anomalies: [`Fallo en auto-avance: ${msg(e)}`] }; }

let reconcile: KnockoutReconcilePlan = { kickoffUpdates: [], anomalies: [] };
try {
  const rows = await deps.reconcileRepo.getKnockoutRows();
  reconcile = planKnockoutReconcile(rows, koFixtures);
  for (const u of reconcile.kickoffUpdates) await deps.reconcileRepo.updateKickoff(u.matchId, u.utc);
} catch (e) { reconcile = { kickoffUpdates: [], anomalies: [`Fallo en reconciliación: ${msg(e)}`] }; }
```

Definir el repo de reconciliación y su impl Prisma:

```ts
export interface KnockoutReconcileRepo {
  getKnockoutRows(): Promise<ReconcileRow[]>;
  updateKickoff(matchId: number, utc: Date): Promise<void>;
}
export function prismaKnockoutReconcileRepo(db: import('@prisma/client').PrismaClient): KnockoutReconcileRepo {
  return {
    async getKnockoutRows() {
      return db.match.findMany({
        where: { isKnockout: true },
        select: { id: true, stage: true, homeCode: true, awayCode: true, kickoffUtc: true },
      }).then((rs) => rs.map((r) => ({ ...r, stage: r.stage as string })));
    },
    async updateKickoff(matchId, utc) { await db.match.update({ where: { id: matchId }, data: { kickoffUtc: utc } }); },
  };
}
```

Actualizar el correo (paso 4 de `runFullSync`) para disparar también si `advance.advanced.length || advance.anomalies.length || reconcile.anomalies.length`. Y `msg = (e) => e instanceof Error ? e.message : 'error'`.

- [ ] **Step 4: Actualizar los dos disparadores**

En `src/app/actions/results.ts` (`syncNowAction`) y `src/app/api/sync/route.ts`, agregar a las deps: `advanceRepo: prismaKnockoutAdvanceRepo(db)` y `reconcileRepo: prismaKnockoutReconcileRepo(db)`.

- [ ] **Step 5: Correr tests + typecheck**

Run: `pnpm test src/server/services/sync.test.ts && pnpm build`
Expected: PASS + build sin errores de tipo en los call-sites de `runFullSync`.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/sync.ts src/app/actions/results.ts src/app/api/sync/route.ts src/server/services/sync.test.ts
git commit -m "feat(bracket): runFullSync — R32-only assign + auto-avance + reconciliación"
```

---

### Task 7: Disparar auto-avance en captura/borrado manual

**Files:**
- Modify: `src/app/actions/results.ts:56-69` (`saveResultAction`, `clearResultAction`)

**Interfaces:**
- Consumes: `runKnockoutAdvance`, `prismaKnockoutAdvanceRepo` (de `sync.ts`).

- [ ] **Step 1: Modificar las acciones**

```ts
// en runAdminAction, tras fn() y antes de refreshAll(), correr el avance para KO.
// Reescribir saveResultAction / clearResultAction para que, además de guardar/borrar,
// corran el auto-avance (idempotente):
export async function saveResultAction(matchId, homeGoals, awayGoals, penWinner) {
  return runAdminAction(async () => {
    await saveResult(prismaResultsRepo(db), matchId, { homeGoals, awayGoals, penWinner });
    await runKnockoutAdvance(prismaKnockoutAdvanceRepo(db));
  });
}
export async function clearResultAction(matchId) {
  return runAdminAction(async () => {
    await removeResult(prismaResultsRepo(db), matchId);
    await runKnockoutAdvance(prismaKnockoutAdvanceRepo(db));
  });
}
```

Agregar imports de `runKnockoutAdvance`, `prismaKnockoutAdvanceRepo` desde `@/server/services/sync`.

- [ ] **Step 2: Typecheck + tests del dominio (siguen verdes)**

Run: `pnpm build && pnpm test src/domain/bracket-topology.test.ts src/server/services/sync.test.ts`
Expected: PASS.

- [ ] **Step 3: Verificación manual (local)**

Levantar la app (skill `run`), como admin capturar el resultado de una llave R32 (p.ej. RSA 0–1 CAN) y confirmar que el octavos correspondiente muestra a Canadá al instante, en la posición congruente.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/results.ts
git commit -m "feat(bracket): auto-avance instantáneo al capturar/borrar resultado manual"
```

---

### Task 8: Aviso por correo — avance y anomalías

**Files:**
- Modify: `src/server/email/templates.ts` (`knockoutAssignedEmail` o nueva sección)
- Test: `src/server/email/templates.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a src/server/email/templates.test.ts
it('el correo lista avances de topología y anomalías', () => {
  const { subject, html } = knockoutAssignedEmail(
    [], // assigned R32
    ['m90 lado H: topología dice CAN pero ya hay BRA con picks — revisa Admin.'],
    'https://app.example',
    [{ matchId: 90, slot: 'H', teamCode: 'CAN' }], // advanced (nuevo parámetro)
  );
  expect(html).toContain('CAN');
  expect(html).toContain('revisa Admin');
  expect(subject).toBeTruthy();
});
```

- [ ] **Step 2: Correr para verificar que falla** — `pnpm test src/server/email/templates.test.ts` → FAIL (firma nueva).

- [ ] **Step 3: Extender la plantilla** para aceptar `advanced` y renderizar una sección "Octavos+ actualizados por avance" además de asignados/anomalías. Ajustar los call-sites en `sync.ts` para pasar `advance.advanced` y concatenar `advance.anomalies`/`reconcile.anomalies`.

- [ ] **Step 4: Correr para verificar que pasa** — `pnpm test src/server/email/templates.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/email/templates.ts src/server/email/templates.test.ts src/server/services/sync.ts
git commit -m "feat(bracket): correo incluye avances de topología y anomalías"
```

---

### Task 9: Port al prototipo (design_handoff)

**Files:**
- Create: `design_handoff_quiniela/js/bracket-topology.js`
- Modify: `design_handoff_quiniela/js/store.js` (recompute de `koTeams` R16+ al mutar `results`)
- Modify: `design_handoff_quiniela/js/bracket.jsx` (`Col`/`byStage` ordena por `bracketRank`)

**Interfaces:**
- Produces (global `window.QDB_TOPOLOGY`): `r32SlotByTeams`, `winnerTarget`, `loserTarget`, `bracketRank`, `computeAdvancement`.

- [ ] **Step 1: Portar el módulo puro a JS plano** (misma data y funciones que `bracket-topology.ts`, sin tipos), expuesto como `window.QDB_TOPOLOGY`. Cargarlo en el HTML antes de `bracket.jsx`.

- [ ] **Step 2: Recompute en `store.js`** — tras mutar `st.results`, recalcular `st.koTeams` de R16+ vía `computeAdvancement` (mapear `results` → outcome con la lógica existente), escribiendo `koTeams[parentId] = { h, a }` conservador (no pisar con-picks). Idempotente.

- [ ] **Step 3: Ordenar el cuadro** — en `bracket.jsx`, donde `byStage(stage)` alimenta cada `Col`, ordenar por `bracketRank` (R32 por par de equipos vía `koTeams`, R16+ por id), igual que `layout.ts`.

- [ ] **Step 4: Verificación visual** — abrir el prototipo, sembrar R32 demo, capturar ganadores y ver octavos llenarse congruentes (Canadá→Marruecos mismo octavos).

- [ ] **Step 5: Commit**

```bash
git add design_handoff_quiniela/js/bracket-topology.js design_handoff_quiniela/js/store.js design_handoff_quiniela/js/bracket.jsx "design_handoff_quiniela/Quiniela del Bienestar.html"
git commit -m "feat(bracket): port de topología + auto-avance al prototipo"
```

---

### Task 10: Gate completo + verificación visual + cierre de rama

- [ ] **Step 1: Suite completa + build**

Run: `pnpm test && pnpm build`
Expected: todo verde, build sin errores. (Gate de la memoria `[[quiniela-dev-runbook]]` antes de push.)

- [ ] **Step 2: Verificación visual end-to-end** (skill `verify`/`run`): en una fase KO, ver el cuadro con líneas congruentes, capturar un ganador y ver la cascada (octavos → cuartos). Confirmar el ancla Canadá→Marruecos.

- [ ] **Step 3: Revisión de código** (skill `requesting-code-review` o `/code-review`) sobre el diff de la rama.

- [ ] **Step 4: Cierre** (skill `finishing-a-development-branch`): decidir merge/PR de `feat/bracket-topologia-auto-avance`.

---

## Self-review (cobertura del spec)

- Spec §1 (datos) → Task 1 (`R32_TEAMS`, `FEEDERS`, `DISPLAY_ORDER`). ✓
- Spec §4/§5 (auto-avance por contenido) → Tasks 2, 4, 7. ✓
- Spec §5.1 (kickoff/lock) → Task 5 (adopción por par) + Task 6 (aplicación en sync). ✓
- Spec §6 (display por bracketRank) → Task 3. ✓
- Spec §7 (swap del planner + reset) → Task 6 (assign R32-only) + Task 4 (writer sobrescribe stale sin picks = reset implícito) + Task 0 (verificación de estado). ✓
- Spec §8 (reconciliación) → Task 5. ✓
- Spec §9 (bordes) → Tasks 2/4 (anomalías: empate sin penales, par no resoluble, conflicto con picks). ✓
- Spec §10 (correo) → Task 8. ✓
- Spec §12 (port) → Task 9. ✓
- Ancla → Tasks 2 y 4 (test explícito). ✓
```
