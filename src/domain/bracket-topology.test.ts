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
