import { describe, it, expect } from 'vitest';
import { MATCHES } from '@/data/worldcup2026';
import type { MatchView } from '@/server/queries';
import { stageSide, finalAndThird, connPath } from './layout';

// Los helpers de layout solo leen id/stage/tag, así que usamos los datos
// sembrados reales (MatchSeed) con un cast estructural.
const M = MATCHES as unknown as MatchView[];

describe('stageSide — reparto izquierda/derecha por fase', () => {
  it('R32 izquierda son las primeras 8 llaves (ids 73–80)', () => {
    expect(stageSide(M, 'R32', 'L', 8).map((m) => m.id)).toEqual([73, 74, 75, 76, 77, 78, 79, 80]);
  });

  it('R32 derecha son las últimas 8 llaves (ids 81–88)', () => {
    expect(stageSide(M, 'R32', 'R', 8).map((m) => m.id)).toEqual([81, 82, 83, 84, 85, 86, 87, 88]);
  });

  it('R16 derecha son 4 (ids 91,92,95,96)', () => {
    expect(stageSide(M, 'R16', 'R', 4).map((m) => m.id)).toEqual([91, 92, 95, 96]);
  });

  it('SF tiene 1 por lado', () => {
    expect(stageSide(M, 'SF', 'L', 1).map((m) => m.id)).toEqual([101]);
    expect(stageSide(M, 'SF', 'R', 1).map((m) => m.id)).toEqual([102]);
  });
});

describe('finalAndThird — separa la final del 3.º lugar por tag', () => {
  it('detecta final (104) y tercer lugar (103)', () => {
    const { final, third } = finalAndThird(M);
    expect(final?.id).toBe(104);
    expect(third?.id).toBe(103);
  });
});

describe('connPath — geometría del conector SVG', () => {
  it('straight es un solo trazo horizontal', () => {
    expect(connPath({ straight: true, dir: 'l2r' })).toMatch(/^M0 350 H 24$/);
  });

  it('con feeders genera trazos (no vacío) y respeta la dirección', () => {
    const l2r = connPath({ feeders: 8, dir: 'l2r' });
    const r2l = connPath({ feeders: 8, dir: 'r2l' });
    expect(l2r.length).toBeGreaterThan(0);
    expect(r2l.length).toBeGreaterThan(0);
    expect(l2r).not.toEqual(r2l);
  });
});

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
