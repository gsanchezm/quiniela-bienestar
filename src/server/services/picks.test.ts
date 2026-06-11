import { describe, it, expect } from 'vitest';
import type { PickValue } from '@/domain/types';
import {
  PickError,
  setOutcome,
  setScorePrediction,
  clearScorePrediction,
  type PickMatch,
  type PicksRepo,
} from './picks';

const FUTURO = new Date('2026-06-11T18:00:00Z'); // una hora antes del kickoff inaugural

const grupos: PickMatch = {
  id: 1,
  kickoffUtc: new Date('2026-06-11T19:00:00Z'),
  isKnockout: false,
  homeCode: 'MEX',
  awayCode: 'RSA',
  homeGoals: null,
  awayGoals: null,
};
const koDefinido: PickMatch = {
  id: 73,
  kickoffUtc: new Date('2026-06-28T17:00:00Z'),
  isKnockout: true,
  homeCode: 'MEX',
  awayCode: 'BRA',
  homeGoals: null,
  awayGoals: null,
};
const koSinEquipos: PickMatch = { ...koDefinido, id: 74, homeCode: null, awayCode: null };
const conResultado: PickMatch = { ...grupos, id: 5, homeGoals: 2, awayGoals: 0 };

function fakeRepo(matches: PickMatch[]): PicksRepo & { picks: Map<string, PickValue> } {
  const picks = new Map<string, PickValue>();
  const key = (u: string, m: number) => `${u}|${m}`;
  return {
    picks,
    async getMatch(id) {
      return matches.find((m) => m.id === id) ?? null;
    },
    async getPick(u, m) {
      return picks.get(key(u, m)) ?? null;
    },
    async upsertPick(u, m, v) {
      picks.set(key(u, m), v);
    },
    async deletePick(u, m) {
      picks.delete(key(u, m));
    },
  };
}

describe('picks 1X2', () => {
  it('guarda un pick nuevo en partido abierto', async () => {
    const repo = fakeRepo([grupos]);
    await setOutcome(repo, 'u1', 1, 'H', FUTURO);
    expect(repo.picks.get('u1|1')).toEqual({ outcome: 'H', predHome: null, predAway: null });
  });

  it('rechaza partidos inexistentes', async () => {
    const repo = fakeRepo([grupos]);
    await expect(setOutcome(repo, 'u1', 999, 'H', FUTURO)).rejects.toThrow(PickError);
  });

  it('rechaza crear o cambiar desde el kickoff (validación de servidor)', async () => {
    const repo = fakeRepo([grupos]);
    const alSilbatazo = new Date('2026-06-11T19:00:00Z');
    await expect(setOutcome(repo, 'u1', 1, 'H', alSilbatazo)).rejects.toThrow(/cerraron/);
  });

  it('rechaza picks cuando el partido ya tiene resultado capturado', async () => {
    const repo = fakeRepo([conResultado]);
    await expect(setOutcome(repo, 'u1', 5, 'H', FUTURO)).rejects.toThrow(/ya tiene resultado/);
  });

  it('rechaza picks en llaves sin equipos asignados', async () => {
    const repo = fakeRepo([koSinEquipos]);
    await expect(setOutcome(repo, 'u1', 74, 'H', FUTURO)).rejects.toThrow(/por definir/i);
  });

  it('rechaza el empate en eliminatoria', async () => {
    const repo = fakeRepo([koDefinido]);
    await expect(setOutcome(repo, 'u1', 73, 'D', FUTURO)).rejects.toThrow(PickError);
  });

  it('repetir el mismo pick lo des-selecciona y borra la fila si no hay marcador', async () => {
    const repo = fakeRepo([grupos]);
    await setOutcome(repo, 'u1', 1, 'H', FUTURO);
    await setOutcome(repo, 'u1', 1, 'H', FUTURO);
    expect(repo.picks.has('u1|1')).toBe(false);
  });

  it('repetir el pick conserva la fila cuando hay marcador capturado', async () => {
    const repo = fakeRepo([grupos]);
    await setScorePrediction(repo, 'u1', 1, 2, 0, FUTURO);
    await setOutcome(repo, 'u1', 1, 'H', FUTURO); // mismo que el implícito → toggle
    expect(repo.picks.get('u1|1')).toEqual({ outcome: null, predHome: 2, predAway: 0 });
  });
});

describe('pronóstico de marcador', () => {
  it('valida 0–99 en ambos lados', async () => {
    const repo = fakeRepo([grupos]);
    await expect(setScorePrediction(repo, 'u1', 1, -1, 0, FUTURO)).rejects.toThrow(PickError);
    await expect(setScorePrediction(repo, 'u1', 1, 0, 100, FUTURO)).rejects.toThrow(PickError);
  });

  it('respeta el cierre al silbatazo', async () => {
    const repo = fakeRepo([grupos]);
    const después = new Date('2026-06-11T20:00:00Z');
    await expect(setScorePrediction(repo, 'u1', 1, 2, 0, después)).rejects.toThrow(/cerraron/);
  });

  it('sin pick previo auto-selecciona el 1X2 implícito del marcador', async () => {
    const repo = fakeRepo([grupos]);
    await setScorePrediction(repo, 'u1', 1, 2, 0, FUTURO);
    expect(repo.picks.get('u1|1')).toEqual({ outcome: 'H', predHome: 2, predAway: 0 });
    await setScorePrediction(repo, 'u2', 1, 1, 1, FUTURO);
    expect(repo.picks.get('u2|1')).toEqual({ outcome: 'D', predHome: 1, predAway: 1 });
  });

  it('en eliminatoria un marcador empatado no auto-selecciona ganador', async () => {
    const repo = fakeRepo([koDefinido]);
    await setScorePrediction(repo, 'u1', 73, 1, 1, FUTURO);
    expect(repo.picks.get('u1|73')).toEqual({ outcome: null, predHome: 1, predAway: 1 });
  });

  it('no pisa un pick 1X2 ya elegido', async () => {
    const repo = fakeRepo([grupos]);
    await setOutcome(repo, 'u1', 1, 'A', FUTURO);
    await setScorePrediction(repo, 'u1', 1, 2, 0, FUTURO);
    expect(repo.picks.get('u1|1')).toEqual({ outcome: 'A', predHome: 2, predAway: 0 });
  });

  it('quitar el marcador conserva el pick; sin pick borra la fila', async () => {
    const repo = fakeRepo([grupos]);
    await setOutcome(repo, 'u1', 1, 'H', FUTURO);
    await setScorePrediction(repo, 'u1', 1, 2, 0, FUTURO);
    await clearScorePrediction(repo, 'u1', 1, FUTURO);
    expect(repo.picks.get('u1|1')).toEqual({ outcome: 'H', predHome: null, predAway: null });

    await setScorePrediction(repo, 'u2', 1, 1, 1, FUTURO);
    repo.picks.set('u2|1', { outcome: null, predHome: 1, predAway: 1 }); // sin pick
    await clearScorePrediction(repo, 'u2', 1, FUTURO);
    expect(repo.picks.has('u2|1')).toBe(false);
  });
});
