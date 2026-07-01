// src/domain/bracket-topology.test.ts
import { describe, it, expect } from 'vitest';
import {
  r32SlotByTeams, winnerTarget, loserTarget, bracketRank, DISPLAY_ORDER, R32_TEAMS,
  computeAdvancement, type AdvanceInput,
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
