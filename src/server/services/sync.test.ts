import { describe, it, expect } from 'vitest';
import {
  runSync,
  selectFinished,
  selectKnockoutFixtures,
  runKnockoutAutoAssign,
  type ProviderMatch,
  type ProviderRawMatch,
  type SyncRepo,
  type SyncMatch,
  type KnockoutAssignRepo,
} from './sync';
import type { Llave, ProviderFixture } from '@/domain/knockout-assign';

const rawMatch = (over: Partial<ProviderRawMatch> = {}): ProviderRawMatch => ({
  utcDate: '2026-06-11T19:00:00Z',
  status: 'FINISHED',
  stage: 'GROUP_STAGE',
  homeTeam: { tla: 'MEX', name: 'México' },
  awayTeam: { tla: 'RSA', name: 'Sudáfrica' },
  score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 0 } },
  ...over,
});

describe('selectores del proveedor', () => {
  it('selectFinished toma solo FINISHED con marcador y lo normaliza', () => {
    const all = [
      rawMatch(),
      rawMatch({ status: 'TIMED', score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } } }),
    ];
    const finished = selectFinished(all);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ homeTla: 'MEX', awayTla: 'RSA', fullTime: { home: 2, away: 0 } });
  });

  it('selectKnockoutFixtures toma fases KO con ambos equipos definidos', () => {
    const all = [
      rawMatch({ stage: 'LAST_32', homeTeam: { tla: 'ESP' }, awayTeam: { tla: 'URU' } }),
      rawMatch({ stage: 'GROUP_STAGE' }), // no KO
      rawMatch({ stage: 'LAST_16', homeTeam: { tla: null }, awayTeam: { tla: 'BRA' } }), // sin equipo
    ];
    const ko = selectKnockoutFixtures(all);
    expect(ko).toHaveLength(1);
    expect(ko[0]).toMatchObject({ stage: 'LAST_32', homeTeam: { tla: 'ESP' }, awayTeam: { tla: 'URU' } });
  });
});

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

function fakeAssignRepo(llaves: Llave[], known: string[]) {
  const writes: Array<{ id: number; home: string; away: string; kickoff: string }> = [];
  const repo: KnockoutAssignRepo = {
    async getKnockoutLlaves() {
      return llaves;
    },
    async getKnownTeamCodes() {
      return new Set(known);
    },
    async assignTeams(id, home, away, kickoffUtc) {
      writes.push({ id, home, away, kickoff: kickoffUtc.toISOString() });
    },
  };
  return { repo, writes };
}

const tbdLlave = (id: number, stage: string, kickoffUtc: string, tag: string | null = null): Llave => ({
  id,
  stage,
  tag,
  homeCode: null,
  awayCode: null,
  kickoffUtc: new Date(kickoffUtc),
});

const fixture = (home: string, away: string, utcDate: string, stage = 'LAST_32'): ProviderFixture => ({
  utcDate,
  stage,
  homeTeam: { tla: home, name: home },
  awayTeam: { tla: away, name: away },
});

describe('runKnockoutAutoAssign', () => {
  const now = new Date('2026-06-28T10:00:00Z');

  it('escribe solo las llaves vacías y reporta lo asignado', async () => {
    const { repo, writes } = fakeAssignRepo(
      [tbdLlave(73, 'R32', '2026-06-28T17:00:00Z'), tbdLlave(74, 'R32', '2026-06-28T20:00:00Z')],
      ['ESP', 'URU', 'MEX', 'BRA'],
    );
    const result = await runKnockoutAutoAssign(
      repo,
      [fixture('ESP', 'URU', '2026-06-28T18:30:00Z'), fixture('MEX', 'BRA', '2026-06-28T20:00:00Z')],
      now,
    );
    expect(writes).toEqual([
      { id: 73, home: 'ESP', away: 'URU', kickoff: '2026-06-28T18:30:00.000Z' },
      { id: 74, home: 'MEX', away: 'BRA', kickoff: '2026-06-28T20:00:00.000Z' },
    ]);
    expect(result.assigned).toHaveLength(2);
    expect(result.anomalies).toEqual([]);
  });

  it('no escribe nada y propaga anomalías cuando hay datos inválidos', async () => {
    const { repo, writes } = fakeAssignRepo([tbdLlave(73, 'R32', '2026-06-28T17:00:00Z')], ['ESP']);
    const result = await runKnockoutAutoAssign(repo, [fixture('ESP', 'ZZZ', '2026-06-28T18:30:00Z')], now);
    expect(writes).toEqual([]);
    expect(result.assigned).toEqual([]);
    expect(result.anomalies.some((a) => a.includes('ZZZ'))).toBe(true);
  });
});
