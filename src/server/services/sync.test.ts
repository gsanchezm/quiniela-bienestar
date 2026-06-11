import { describe, it, expect } from 'vitest';
import { runSync, type ProviderMatch, type SyncRepo, type SyncMatch } from './sync';

const partido = (over: Partial<SyncMatch> = {}): SyncMatch => ({
  id: 1,
  kickoffUtc: new Date('2026-06-11T19:00:00Z'),
  isKnockout: false,
  homeCode: 'MEX',
  awayCode: 'RSA',
  homeGoals: null,
  awayGoals: null,
  penWinner: null,
  ...over,
});

const remoto = (over: Partial<ProviderMatch> = {}): ProviderMatch => ({
  homeTla: 'MEX',
  awayTla: 'RSA',
  utcDate: '2026-06-11T19:00:00Z',
  fullTime: { home: 2, away: 0 },
  duration: 'REGULAR',
  winner: 'HOME_TEAM',
  ...over,
});

function fakeRepo(matches: SyncMatch[]) {
  const saved: Array<{ id: number; hg: number; ag: number; pen: 'H' | 'A' | null }> = [];
  const repo: SyncRepo = {
    async getSyncableMatches() {
      return matches;
    },
    async setResult(id, hg, ag, pen) {
      saved.push({ id, hg, ag, pen });
    },
  };
  return { repo, saved };
}

describe('sincronización con football-data.org', () => {
  it('empareja por códigos TLA y fecha cercana, y guarda el resultado', async () => {
    const { repo, saved } = fakeRepo([partido()]);
    const resumen = await runSync(repo, [remoto()]);
    expect(saved).toEqual([{ id: 1, hg: 2, ag: 0, pen: null }]);
    expect(resumen).toMatchObject({ remoteFinished: 1, updated: 1, skippedManual: 0, unmatched: 0 });
  });

  it('en penales toma los goles del juego y el ganador de la tanda', async () => {
    const ko = partido({ id: 73, isKnockout: true, homeCode: 'MEX', awayCode: 'BRA', kickoffUtc: new Date('2026-06-28T17:00:00Z') });
    const { repo, saved } = fakeRepo([ko]);
    await runSync(repo, [
      remoto({
        homeTla: 'MEX',
        awayTla: 'BRA',
        utcDate: '2026-06-28T17:00:00Z',
        fullTime: { home: 1, away: 1 },
        duration: 'PENALTY_SHOOTOUT',
        winner: 'AWAY_TEAM',
      }),
    ]);
    expect(saved).toEqual([{ id: 73, hg: 1, ag: 1, pen: 'A' }]);
  });

  it('no pisa un resultado manual distinto (el manual gana) y lo reporta', async () => {
    const { repo, saved } = fakeRepo([partido({ homeGoals: 3, awayGoals: 1 })]);
    const resumen = await runSync(repo, [remoto()]);
    expect(saved).toEqual([]);
    expect(resumen).toMatchObject({ updated: 0, skippedManual: 1 });
  });

  it('un resultado ya idéntico no se reescribe ni cuenta como manual', async () => {
    const { repo, saved } = fakeRepo([partido({ homeGoals: 2, awayGoals: 0 })]);
    const resumen = await runSync(repo, [remoto()]);
    expect(saved).toEqual([]);
    expect(resumen).toMatchObject({ updated: 0, skippedManual: 0, unchanged: 1 });
  });

  it('reporta como unmatched lo que no embona (TLA desconocido o fecha lejana)', async () => {
    const { repo, saved } = fakeRepo([partido()]);
    const resumen = await runSync(repo, [
      remoto({ homeTla: 'XXX' }),
      remoto({ utcDate: '2026-07-30T19:00:00Z' }),
    ]);
    expect(saved).toEqual([]);
    expect(resumen.unmatched).toBe(2);
  });

  it('distingue el duelo de grupos de una revancha en eliminatoria por la fecha', async () => {
    const j1 = partido();
    const final = partido({ id: 104, isKnockout: true, kickoffUtc: new Date('2026-07-19T19:00:00Z') });
    const { repo, saved } = fakeRepo([j1, final]);
    await runSync(repo, [
      remoto({ utcDate: '2026-07-19T19:00:00Z', fullTime: { home: 1, away: 0 } }),
    ]);
    expect(saved).toEqual([{ id: 104, hg: 1, ag: 0, pen: null }]);
  });
});
