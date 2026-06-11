import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings';
import type { FinishedMatch, PicksByUser, StandingsUser } from './standings';

const u = (id: string, nombre: string, apellido: string): StandingsUser => ({ id, nombre, apellido });

const fm = (
  id: number,
  homeGoals: number,
  awayGoals: number,
  isKnockout = false,
  penWinner: 'H' | 'A' | null = null,
): FinishedMatch => ({ id, isKnockout, result: { homeGoals, awayGoals, penWinner } });

describe('tabla de posiciones', () => {
  it('ordena por puntos descendentes (el marcador exacto pesa más que un acierto)', () => {
    const users = [u('u1', 'Beto', 'Aguilar'), u('u2', 'Ana', 'Torres')];
    const finished = [fm(1, 2, 0), fm(2, 1, 1)];
    const picks: PicksByUser = {
      u1: { 1: { outcome: 'H', predHome: null, predAway: null } }, // 1 pt
      u2: { 1: { outcome: 'H', predHome: 2, predAway: 0 } }, // 3 pts
    };
    const rows = computeStandings(users, finished, picks);
    expect(rows.map((r) => r.userId)).toEqual(['u2', 'u1']);
    expect(rows[0].points).toBe(3);
    expect(rows[1].points).toBe(1);
  });

  it('a puntos iguales desempata por aciertos 1X2', () => {
    const users = [u('u3', 'Carlos', 'Zúñiga'), u('u1', 'Beto', 'Aguilar')];
    const finished = [fm(1, 2, 0), fm(2, 1, 1), fm(3, 0, 1)];
    const picks: PicksByUser = {
      // u1: tres aciertos 1X2 → 3 pts, 3 aciertos
      u1: {
        1: { outcome: 'H', predHome: null, predAway: null },
        2: { outcome: 'D', predHome: null, predAway: null },
        3: { outcome: 'A', predHome: null, predAway: null },
      },
      // u3: un acierto con marcador exacto → 3 pts, 1 acierto
      u3: { 1: { outcome: 'H', predHome: 2, predAway: 0 } },
    };
    const rows = computeStandings(users, finished, picks);
    expect(rows.map((r) => r.userId)).toEqual(['u1', 'u3']);
    expect(rows[0].aciertos).toBe(3);
    expect(rows[1].aciertos).toBe(1);
    expect(rows[1].exactos).toBe(1);
  });

  it('a empate total desempata alfabéticamente por nombre', () => {
    const users = [u('u1', 'Beto', 'Aguilar'), u('u2', 'Ana', 'Torres')];
    const rows = computeStandings(users, [], {});
    expect(rows.map((r) => r.userId)).toEqual(['u2', 'u1']);
  });

  it('acumula jugados, totalPicks y exactos; usuarios sin picks aparecen en ceros', () => {
    const users = [u('u1', 'Beto', 'Aguilar'), u('u2', 'Ana', 'Torres')];
    const finished = [fm(1, 1, 1, true, 'A'), fm(2, 2, 1)];
    const picks: PicksByUser = {
      u2: {
        1: { outcome: 'A', predHome: 1, predAway: 1 }, // 1X2 ✓ + exacto → 3
        2: { outcome: 'A', predHome: null, predAway: null }, // falla
        5: { outcome: 'H', predHome: null, predAway: null }, // partido sin terminar
      },
    };
    const rows = computeStandings(users, finished, picks);
    const ana = rows.find((r) => r.userId === 'u2')!;
    const beto = rows.find((r) => r.userId === 'u1')!;
    expect(ana).toMatchObject({ points: 3, aciertos: 1, exactos: 1, jugados: 2, totalPicks: 3 });
    expect(beto).toMatchObject({ points: 0, aciertos: 0, exactos: 0, jugados: 2, totalPicks: 0 });
  });
});
