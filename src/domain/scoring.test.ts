import { describe, it, expect } from 'vitest';
import { impliedOutcome, matchOutcome, scorePick } from './scoring';
import type { MatchResult, Outcome, PickValue } from './types';

const res = (homeGoals: number, awayGoals: number, penWinner: 'H' | 'A' | null = null): MatchResult => ({
  homeGoals,
  awayGoals,
  penWinner,
});

const pick = (
  outcome: Outcome | null,
  predHome: number | null = null,
  predAway: number | null = null,
): PickValue => ({ outcome, predHome, predAway });

describe('resultado del partido', () => {
  it('gana local / empate / gana visita en fase de grupos', () => {
    expect(matchOutcome(res(2, 1), false)).toBe('H');
    expect(matchOutcome(res(1, 1), false)).toBe('D');
    expect(matchOutcome(res(0, 3), false)).toBe('A');
  });

  it('en eliminatoria el empate lo decide el ganador en penales', () => {
    expect(matchOutcome(res(1, 1, 'H'), true)).toBe('H');
    expect(matchOutcome(res(0, 0, 'A'), true)).toBe('A');
  });

  it('en eliminatoria empatado sin penales capturados no hay resultado', () => {
    expect(matchOutcome(res(1, 1), true)).toBeNull();
  });
});

describe('resultado implícito de un marcador', () => {
  it('deriva H/A/D en fase de grupos', () => {
    expect(impliedOutcome(2, 0, false)).toBe('H');
    expect(impliedOutcome(0, 2, false)).toBe('A');
    expect(impliedOutcome(1, 1, false)).toBe('D');
  });

  it('en eliminatoria un marcador empatado no implica ganador (penales)', () => {
    expect(impliedOutcome(1, 1, true)).toBeNull();
    expect(impliedOutcome(3, 1, true)).toBe('H');
  });
});

describe('puntos por partido', () => {
  it('da 1 punto por acertar el resultado 1X2', () => {
    expect(scorePick(pick('H'), res(2, 0), false)).toEqual({
      points: 1,
      outcomeHit: true,
      exactHit: false,
    });
  });

  it('da 3 puntos (1+2) cuando además el marcador exacto coincide', () => {
    expect(scorePick(pick('H', 2, 0), res(2, 0), false)).toEqual({
      points: 3,
      outcomeHit: true,
      exactHit: true,
    });
  });

  it('da 2 puntos cuando solo acierta el marcador exacto sin pick 1X2', () => {
    expect(scorePick(pick(null, 1, 1), res(1, 1), false)).toEqual({
      points: 2,
      outcomeHit: false,
      exactHit: true,
    });
  });

  it('en eliminatoria con penales el marcador exacto compara el marcador del juego', () => {
    // real: 1-1, gana A en penales; pronóstico 1-1 y pick "gana A" → 1 + 2 = 3
    expect(scorePick(pick('A', 1, 1), res(1, 1, 'A'), true)).toEqual({
      points: 3,
      outcomeHit: true,
      exactHit: true,
    });
  });

  it('acertar el marcador pero fallar al ganador en penales da solo los 2 extra', () => {
    expect(scorePick(pick('H', 1, 1), res(1, 1, 'A'), true)).toEqual({
      points: 2,
      outcomeHit: false,
      exactHit: true,
    });
  });

  it('no da puntos con pick y marcador errados', () => {
    expect(scorePick(pick('A', 0, 2), res(2, 0), false)).toEqual({
      points: 0,
      outcomeHit: false,
      exactHit: false,
    });
  });

  it('marcador parcial (solo un lado capturado) no cuenta como exacto', () => {
    expect(scorePick(pick('H', 2, null), res(2, 0), false)).toEqual({
      points: 1,
      outcomeHit: true,
      exactHit: false,
    });
  });

  it('sin pick ni marcador no hay puntos', () => {
    expect(scorePick(pick(null), res(2, 0), false)).toEqual({
      points: 0,
      outcomeHit: false,
      exactHit: false,
    });
  });
});
