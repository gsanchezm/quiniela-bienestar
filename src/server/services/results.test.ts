import { describe, it, expect } from 'vitest';
import {
  ResultError,
  saveResult,
  removeResult,
  assignKnockoutTeams,
  type ResultsMatch,
  type ResultsRepo,
} from './results';

const ANTES = new Date('2026-06-20T00:00:00Z');
const DESPUES = new Date('2026-07-01T00:00:00Z');

const grupos: ResultsMatch = {
  id: 1,
  kickoffUtc: new Date('2026-06-11T19:00:00Z'),
  isKnockout: false,
  homeCode: 'MEX',
  awayCode: 'RSA',
};
const ko: ResultsMatch = {
  id: 73,
  kickoffUtc: new Date('2026-06-28T17:00:00Z'),
  isKnockout: true,
  homeCode: null,
  awayCode: null,
};

interface FakeState {
  results: Map<number, { hg: number; ag: number; pen: 'H' | 'A' | null }>;
  teams: Map<number, { h: string | null; a: string | null }>;
  picksDeleted: number[];
}

function fakeRepo(matches: ResultsMatch[]): ResultsRepo & FakeState {
  const state: FakeState = { results: new Map(), teams: new Map(), picksDeleted: [] };
  return {
    ...state,
    async getMatch(id) {
      const m = matches.find((x) => x.id === id);
      if (!m) return null;
      const t = state.teams.get(id);
      return t ? { ...m, homeCode: t.h, awayCode: t.a } : m;
    },
    async setResult(id, hg, ag, pen) {
      state.results.set(id, { hg, ag, pen });
    },
    async clearResult(id) {
      state.results.delete(id);
    },
    async setTeams(id, h, a) {
      state.teams.set(id, { h, a });
    },
    async deletePicksForMatch(id) {
      state.picksDeleted.push(id);
    },
  };
}

describe('captura de resultados (admin)', () => {
  it('guarda un marcador válido', async () => {
    const repo = fakeRepo([grupos]);
    await saveResult(repo, 1, { homeGoals: 2, awayGoals: 0, penWinner: null }, DESPUES);
    expect(repo.results.get(1)).toEqual({ hg: 2, ag: 0, pen: null });
  });

  it('rechaza marcadores fuera de 0–99', async () => {
    const repo = fakeRepo([grupos]);
    await expect(saveResult(repo, 1, { homeGoals: -1, awayGoals: 0, penWinner: null }, DESPUES)).rejects.toThrow(ResultError);
    await expect(saveResult(repo, 1, { homeGoals: 0, awayGoals: 100, penWinner: null }, DESPUES)).rejects.toThrow(ResultError);
  });

  it('en grupos el empate no lleva penales', async () => {
    const repo = fakeRepo([grupos]);
    await saveResult(repo, 1, { homeGoals: 1, awayGoals: 1, penWinner: null }, DESPUES);
    await expect(saveResult(repo, 1, { homeGoals: 1, awayGoals: 1, penWinner: 'H' }, DESPUES)).rejects.toThrow(ResultError);
  });

  it('en eliminatoria empatada exige ganador de penales', async () => {
    const repo = fakeRepo([{ ...ko, homeCode: 'MEX', awayCode: 'BRA' }]);
    await expect(saveResult(repo, 73, { homeGoals: 1, awayGoals: 1, penWinner: null }, DESPUES)).rejects.toThrow(/penales/i);
    await saveResult(repo, 73, { homeGoals: 1, awayGoals: 1, penWinner: 'A' }, DESPUES);
    expect(repo.results.get(73)).toEqual({ hg: 1, ag: 1, pen: 'A' });
  });

  it('puede borrar un resultado capturado', async () => {
    const repo = fakeRepo([grupos]);
    await saveResult(repo, 1, { homeGoals: 2, awayGoals: 0, penWinner: null }, DESPUES);
    await removeResult(repo, 1);
    expect(repo.results.has(1)).toBe(false);
  });

  it('rechaza capturar un resultado antes del kickoff', async () => {
    const repo = fakeRepo([grupos]);
    const antesDelKickoff = new Date('2026-06-11T18:00:00Z');
    await expect(
      saveResult(repo, 1, { homeGoals: 2, awayGoals: 0, penWinner: null }, antesDelKickoff),
    ).rejects.toThrow(/no inicia/i);
    expect(repo.results.has(1)).toBe(false);
  });
});

describe('asignación de equipos en llaves', () => {
  it('asigna equipos a una llave vacía sin borrar picks', async () => {
    const repo = fakeRepo([ko]);
    await assignKnockoutTeams(repo, 73, 'MEX', 'BRA', ANTES);
    expect(repo.teams.get(73)).toEqual({ h: 'MEX', a: 'BRA' });
    expect(repo.picksDeleted).toEqual([]);
  });

  it('cambiar los equipos de una llave ya asignada borra los picks afectados', async () => {
    const repo = fakeRepo([ko]);
    await assignKnockoutTeams(repo, 73, 'MEX', 'BRA', ANTES);
    await assignKnockoutTeams(repo, 73, 'MEX', 'FRA', ANTES);
    expect(repo.teams.get(73)).toEqual({ h: 'MEX', a: 'FRA' });
    expect(repo.picksDeleted).toEqual([73]);
  });

  it('rechaza equipos repetidos, partidos de grupos y llaves ya iniciadas', async () => {
    const repo = fakeRepo([ko, grupos]);
    await expect(assignKnockoutTeams(repo, 73, 'MEX', 'MEX', ANTES)).rejects.toThrow(ResultError);
    await expect(assignKnockoutTeams(repo, 1, 'MEX', 'BRA', ANTES)).rejects.toThrow(ResultError);
    const despuésDelKickoff = new Date('2026-06-28T18:00:00Z');
    await expect(assignKnockoutTeams(repo, 73, 'MEX', 'BRA', despuésDelKickoff)).rejects.toThrow(/inici/i);
  });
});
