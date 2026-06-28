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
