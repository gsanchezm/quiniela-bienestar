import { describe, it, expect } from 'vitest';
import {
  runSync,
  selectFinished,
  selectKnockoutFixtures,
  runKnockoutAutoAssign,
  runFullSync,
  runKnockoutAdvance,
  type ProviderMatch,
  type ProviderRawMatch,
  type SyncRepo,
  type SyncMatch,
  type KnockoutAssignRepo,
  type FullSyncDeps,
  type KnockoutAdvanceRepo,
  type AdvanceDbMatch,
} from './sync';
import type { Llave, ProviderFixture } from '@/domain/knockout-assign';
import type { EmailSender } from '@/server/email/sender';

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
    expect(result.assigned).toEqual([
      { matchId: 73, stage: 'R32', homeCode: 'ESP', awayCode: 'URU' },
      { matchId: 74, stage: 'R32', homeCode: 'MEX', awayCode: 'BRA' },
    ]);
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

function fakeSender() {
  const sent: Array<{ to: string | string[]; subject: string }> = [];
  const sender: EmailSender = {
    async send(to, subject) {
      sent.push({ to, subject });
    },
  };
  return { sender, sent };
}

function buildDeps(over: Partial<FullSyncDeps>, sender: EmailSender): FullSyncDeps {
  return {
    provider: { async fetchAll() { return []; } },
    syncRepo: { async getSyncableMatches() { return []; }, async setResult() {} },
    assignRepo: {
      async getKnockoutLlaves() { return []; },
      async getKnownTeamCodes() { return new Set(); },
      async assignTeams() {},
    },
    sender,
    adminEmails: ['admin@demo.mx'],
    appUrl: 'https://quiniela.example',
    ...over,
  };
}

describe('runFullSync', () => {
  const now = new Date('2026-06-28T10:00:00Z');

  it('asigna cruces KO nuevos y manda correo al admin', async () => {
    const { sender, sent } = fakeSender();
    const raw: ProviderRawMatch[] = [
      {
        utcDate: '2026-06-28T18:30:00Z',
        status: 'TIMED',
        stage: 'LAST_32',
        homeTeam: { tla: 'ESP' },
        awayTeam: { tla: 'URU' },
        score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
      },
    ];
    const writes: number[] = [];
    const deps = buildDeps(
      {
        provider: { async fetchAll() { return raw; } },
        assignRepo: {
          async getKnockoutLlaves() {
            return [{ id: 73, stage: 'R32', tag: null, homeCode: null, awayCode: null, kickoffUtc: new Date('2026-06-28T17:00:00Z') }];
          },
          async getKnownTeamCodes() { return new Set(['ESP', 'URU']); },
          async assignTeams(id) { writes.push(id); },
        },
      },
      sender,
    );
    const summary = await runFullSync(deps, now);
    expect(writes).toEqual([73]);
    expect(summary.assign.assigned).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['admin@demo.mx']);
    expect(sent[0].subject).toBeTruthy();
  });

  it('no manda correo si no hay admins configurados, aunque haya asignaciones', async () => {
    const { sender, sent } = fakeSender();
    const raw: ProviderRawMatch[] = [
      {
        utcDate: '2026-06-28T18:30:00Z',
        status: 'TIMED',
        stage: 'LAST_32',
        homeTeam: { tla: 'ESP' },
        awayTeam: { tla: 'URU' },
        score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
      },
    ];
    const deps = buildDeps(
      {
        adminEmails: [],
        provider: { async fetchAll() { return raw; } },
        assignRepo: {
          async getKnockoutLlaves() {
            return [{ id: 73, stage: 'R32', tag: null, homeCode: null, awayCode: null, kickoffUtc: new Date('2026-06-28T17:00:00Z') }];
          },
          async getKnownTeamCodes() { return new Set(['ESP', 'URU']); },
          async assignTeams() {},
        },
      },
      sender,
    );
    const summary = await runFullSync(deps, now);
    expect(summary.assign.assigned).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it('no manda correo cuando no hay novedades ni anomalías', async () => {
    const { sender, sent } = fakeSender();
    const summary = await runFullSync(buildDeps({}, sender), now);
    expect(summary.assign.assigned).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('un fallo de la auto-asignación no rompe el sync de goles', async () => {
    const { sender } = fakeSender();
    const deps = buildDeps(
      {
        assignRepo: {
          async getKnockoutLlaves() { throw new Error('boom'); },
          async getKnownTeamCodes() { return new Set(); },
          async assignTeams() {},
        },
      },
      sender,
    );
    const summary = await runFullSync(deps, now);
    expect(summary.sync.remoteFinished).toBe(0); // el sync corrió igual
    expect(summary.assign.anomalies.some((a) => a.includes('boom'))).toBe(true);
  });

  it('un fallo de Resend no rompe el sync', async () => {
    const failing: EmailSender = { async send() { throw new Error('resend down'); } };
    const raw: ProviderRawMatch[] = [
      {
        utcDate: '2026-06-28T18:30:00Z',
        status: 'TIMED',
        stage: 'LAST_32',
        homeTeam: { tla: 'ESP' },
        awayTeam: { tla: 'URU' },
        score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
      },
    ];
    const deps = buildDeps(
      {
        provider: { async fetchAll() { return raw; } },
        assignRepo: {
          async getKnockoutLlaves() {
            return [{ id: 73, stage: 'R32', tag: null, homeCode: null, awayCode: null, kickoffUtc: new Date('2026-06-28T17:00:00Z') }];
          },
          async getKnownTeamCodes() { return new Set(['ESP', 'URU']); },
          async assignTeams() {},
        },
      },
      failing,
    );
    const summary = await runFullSync(deps, now); // no debe lanzar
    expect(summary.assign.assigned).toHaveLength(1);
  });
});

function fakeAdvanceRepo(rows: AdvanceDbMatch[]) {
  const writes: Array<{ matchId: number; slot: 'H' | 'A'; teamCode: string }> = [];
  const repo: KnockoutAdvanceRepo = {
    async getKnockoutMatches() { return rows; },
    async setSlotTeam(matchId, slot, teamCode) {
      writes.push({ matchId, slot, teamCode });
      const t = rows.find((r) => r.id === matchId)!;
      if (slot === 'H') t.homeCode = teamCode; else t.awayCode = teamCode;
    },
  };
  return { repo, writes };
}

const R32 = (id: number, h: string, a: string, hg: number, ag: number, pen: 'H' | 'A' | null = null): AdvanceDbMatch =>
  ({ id, stage: 'R32', isKnockout: true, homeCode: h, awayCode: a, homeGoals: hg, awayGoals: ag, penWinner: pen, hasPicks: false });
const EMPTY = (id: number, stage: string): AdvanceDbMatch =>
  ({ id, stage, isKnockout: true, homeCode: null, awayCode: null, homeGoals: null, awayGoals: null, penWinner: null, hasPicks: false });

describe('runKnockoutAdvance', () => {
  it('llena octavos 90 con Canadá y Marruecos', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1), R32(704, 'NED', 'MAR', 1, 1, 'A'), EMPTY(90, 'R16'),
    ]);
    const res = await runKnockoutAdvance(repo);
    expect(res.anomalies).toEqual([]);
    expect(writes).toContainEqual({ matchId: 90, slot: 'H', teamCode: 'CAN' });
    expect(writes).toContainEqual({ matchId: 90, slot: 'A', teamCode: 'MAR' });
  });

  it('es idempotente: no re-escribe un casillero ya correcto', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1),
      { ...EMPTY(90, 'R16'), homeCode: 'CAN' }, // ya tiene CAN en H
    ]);
    await runKnockoutAdvance(repo);
    expect(writes).toEqual([]);
  });

  it('no pisa un casillero con OTRO equipo si ya tiene picks → anomalía', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1),
      { ...EMPTY(90, 'R16'), homeCode: 'BRA', hasPicks: true },
    ]);
    const res = await runKnockoutAdvance(repo);
    expect(writes).toEqual([]);
    expect(res.anomalies).toHaveLength(1);
  });

  it('sobrescribe casillero stale (otro equipo, SIN picks ni resultado)', async () => {
    const { repo, writes } = fakeAdvanceRepo([
      R32(701, 'RSA', 'CAN', 0, 1),
      { ...EMPTY(90, 'R16'), homeCode: 'BRA' }, // stale del proveedor, sin picks
    ]);
    await runKnockoutAdvance(repo);
    expect(writes).toContainEqual({ matchId: 90, slot: 'H', teamCode: 'CAN' });
  });
});
