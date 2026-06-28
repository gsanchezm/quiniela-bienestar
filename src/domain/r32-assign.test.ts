import { describe, it, expect } from 'vitest';
import {
  planAssignments,
  selectR32Fixtures,
  stageHistogram,
  type Llave,
  type ProviderFixture,
} from './r32-assign';

const known = new Set(['ESP', 'URU', 'MEX', 'BRA', 'ARG', 'FRA', 'GER', 'POR']);
const now = new Date('2026-06-28T10:00:00Z');

// Llave vacía sembrada (TBD) con la hora estimada del seed.
const tbd = (id: number, kickoffUtc: string): Llave => ({ id, homeCode: null, awayCode: null, kickoffUtc: new Date(kickoffUtc) });

const fx = (home: string, away: string, utcDate: string, stage = 'LAST_32'): ProviderFixture => ({
  utcDate,
  stage,
  homeTeam: { tla: home, name: home },
  awayTeam: { tla: away, name: away },
});

describe('selectR32Fixtures', () => {
  it('toma solo la fase pedida y solo cruces con ambos equipos', () => {
    const all: ProviderFixture[] = [
      fx('ESP', 'URU', '2026-06-28T17:00:00Z', 'LAST_32'),
      fx('MEX', 'BRA', '2026-06-29T17:00:00Z', 'GROUP_STAGE'), // otra fase
      { utcDate: '2026-06-30T17:00:00Z', stage: 'LAST_32', homeTeam: { tla: null }, awayTeam: { tla: 'ARG' } }, // TBD
    ];
    const sel = selectR32Fixtures(all, ['LAST_32']);
    expect(sel).toHaveLength(1);
    expect(sel[0].homeTeam.tla).toBe('ESP');
  });

  it('acepta varios códigos de fase candidatos', () => {
    const all = [fx('ESP', 'URU', '2026-06-28T17:00:00Z', 'ROUND_OF_32')];
    expect(selectR32Fixtures(all, ['LAST_32', 'ROUND_OF_32'])).toHaveLength(1);
  });
});

describe('stageHistogram', () => {
  it('cuenta partidos por nombre de fase del proveedor', () => {
    const all = [
      fx('ESP', 'URU', '2026-06-28T17:00:00Z', 'LAST_32'),
      fx('MEX', 'BRA', '2026-06-29T17:00:00Z', 'LAST_32'),
      fx('ARG', 'FRA', '2026-06-24T17:00:00Z', 'GROUP_STAGE'),
    ];
    expect(stageHistogram(all)).toEqual({ LAST_32: 2, GROUP_STAGE: 1 });
  });
});

describe('planAssignments', () => {
  it('llena llaves vacías y conserva el orden home/away del proveedor', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T17:00:00Z'), fx('MEX', 'BRA', '2026-06-28T20:00:00Z')];
    const llaves = [tbd(73, '2026-06-28T17:00:00Z'), tbd(74, '2026-06-28T20:00:00Z')];
    const plan = planAssignments(fixtures, llaves, known, now);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => ({ matchId: r.matchId, homeCode: r.homeCode, awayCode: r.awayCode, status: r.status }))).toEqual([
      { matchId: 73, homeCode: 'ESP', awayCode: 'URU', status: 'assign' },
      { matchId: 74, homeCode: 'MEX', awayCode: 'BRA', status: 'assign' },
    ]);
  });

  it('por defecto NO cambia la hora: kickoffUtc = la sembrada, providerKickoffUtc = la real', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z')]; // real, distinta de la sembrada
    const llaves = [tbd(73, '2026-06-28T17:00:00Z')]; // sembrada
    const [row] = planAssignments(fixtures, llaves, known, now).rows;
    expect(row.kickoffUtc).toEqual(new Date('2026-06-28T17:00:00Z')); // se respeta la sembrada
    expect(row.providerKickoffUtc).toEqual(new Date('2026-06-28T18:30:00Z')); // informativa
  });

  it('con setKickoff usa la hora real del proveedor', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:30:00Z')];
    const llaves = [tbd(73, '2026-06-28T17:00:00Z')];
    const [row] = planAssignments(fixtures, llaves, known, now, { setKickoff: true }).rows;
    expect(row.kickoffUtc).toEqual(new Date('2026-06-28T18:30:00Z'));
  });

  it('empareja por fecha del cruce con id de llave aunque lleguen desordenados', () => {
    const fixtures = [fx('MEX', 'BRA', '2026-06-28T20:00:00Z'), fx('ESP', 'URU', '2026-06-28T17:00:00Z')];
    const llaves = [tbd(74, '2026-06-28T20:00:00Z'), tbd(73, '2026-06-28T17:00:00Z')];
    const plan = planAssignments(fixtures, llaves, known, now);
    // el cruce más temprano (ESP-URU) cae en la llave de id menor (73)
    expect(plan.rows.find((r) => r.matchId === 73)).toMatchObject({ homeCode: 'ESP', awayCode: 'URU' });
    expect(plan.rows.find((r) => r.matchId === 74)).toMatchObject({ homeCode: 'MEX', awayCode: 'BRA' });
  });

  it('llena una llave vacía aunque la hora efectiva ya haya pasado', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:00:00Z')];
    const llaves = [tbd(73, '2026-06-28T09:00:00Z')];
    expect(planAssignments(fixtures, llaves, known, now).rows[0].status).toBe('assign');
  });

  it('el cierre de sobrescrituras lo gobierna la hora EN EFECTO: sembrada por defecto, real con setKickoff', () => {
    // Sembrada ya pasó (09:00 < 10:00), pero la real es futura (18:00).
    const fixtures = [fx('ESP', 'URU', '2026-06-28T18:00:00Z')];
    const llaves: Llave[] = [{ id: 73, homeCode: 'GER', awayCode: 'POR', kickoffUtc: new Date('2026-06-28T09:00:00Z') }];
    // default: la sembrada gobierna, ya inició y no se pisa
    expect(planAssignments(fixtures, llaves, known, now).rows[0].status).toBe('locked');
    // setKickoff: la real gobierna, aún no inicia y queda como sobrescritura explícita
    expect(planAssignments(fixtures, llaves, known, now, { setKickoff: true }).rows[0].status).toBe('occupied');
  });

  it('marca unchanged si la llave ya tenía exactamente esos equipos (idempotente)', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T17:00:00Z')];
    const llave: Llave = { id: 73, homeCode: 'ESP', awayCode: 'URU', kickoffUtc: new Date('2026-06-28T17:00:00Z') };
    expect(planAssignments(fixtures, [llave], known, now).rows[0].status).toBe('unchanged');
  });

  it('marca occupied si la llave ya tenía OTROS equipos (requiere --force)', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T17:00:00Z')];
    const llave: Llave = { id: 73, homeCode: 'GER', awayCode: 'POR', kickoffUtc: new Date('2026-06-28T17:00:00Z') };
    expect(planAssignments(fixtures, [llave], known, now).rows[0].status).toBe('occupied');
  });

  it('error si un código del proveedor no existe entre nuestras selecciones', () => {
    const fixtures = [fx('ESP', 'XXX', '2026-06-28T17:00:00Z')];
    const plan = planAssignments(fixtures, [tbd(73, '2026-06-28T17:00:00Z')], known, now);
    expect(plan.errors.some((e) => e.includes('XXX'))).toBe(true);
  });

  it('error si un equipo aparece dos veces en la ronda', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T17:00:00Z'), fx('ESP', 'BRA', '2026-06-28T20:00:00Z')];
    const llaves = [tbd(73, '2026-06-28T17:00:00Z'), tbd(74, '2026-06-28T20:00:00Z')];
    const plan = planAssignments(fixtures, llaves, known, now);
    expect(plan.errors.some((e) => e.includes('ESP') && e.includes('2 veces'))).toBe(true);
  });

  it('error si el número de cruces y de llaves no coincide', () => {
    const fixtures = [fx('ESP', 'URU', '2026-06-28T17:00:00Z')];
    const llaves = [tbd(73, '2026-06-28T17:00:00Z'), tbd(74, '2026-06-28T20:00:00Z')];
    const plan = planAssignments(fixtures, llaves, known, now);
    expect(plan.errors.some((e) => e.includes('deben coincidir'))).toBe(true);
  });
});
