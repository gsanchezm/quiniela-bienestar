import type { PrismaClient } from '@prisma/client';
import { env } from '@/server/env';
import { mapFdStage, type ProviderFixture } from '@/domain/knockout-assign';

// Partido remoto ya normalizado por el proveedor (football-data.org v4).
export interface ProviderMatch {
  homeTla: string | null;
  awayTla: string | null;
  utcDate: string;
  fullTime: { home: number; away: number };
  duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
}

export interface ResultsProvider {
  fetchAll(): Promise<ProviderRawMatch[]>;
  fetchFinished(): Promise<ProviderMatch[]>;
}

export interface SyncMatch {
  id: number;
  kickoffUtc: Date;
  isKnockout: boolean;
  homeCode: string | null;
  awayCode: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  penWinner: 'H' | 'A' | null;
}

export interface SyncRepo {
  getSyncableMatches(): Promise<SyncMatch[]>;
  setResult(matchId: number, hg: number, ag: number, penWinner: 'H' | 'A' | null): Promise<void>;
}

export interface SyncSummary {
  remoteFinished: number; // partidos que el proveedor ya reporta como finalizados
  updated: number;
  unchanged: number;
  skippedManual: number; // ya había un resultado manual distinto: el manual gana
  unmatched: number;
}

// El mismo cruce puede repetirse (grupos y luego eliminatoria): desempata la fecha.
const DATE_TOLERANCE_MS = 36 * 3_600_000;

export async function runSync(repo: SyncRepo, remote: ProviderMatch[]): Promise<SyncSummary> {
  const ours = (await repo.getSyncableMatches()).filter((m) => m.homeCode && m.awayCode);
  const summary: SyncSummary = {
    remoteFinished: remote.length,
    updated: 0,
    unchanged: 0,
    skippedManual: 0,
    unmatched: 0,
  };

  for (const r of remote) {
    const date = Date.parse(r.utcDate);
    const match = ours.find(
      (m) =>
        m.homeCode === r.homeTla &&
        m.awayCode === r.awayTla &&
        Math.abs(m.kickoffUtc.getTime() - date) <= DATE_TOLERANCE_MS,
    );
    if (!match) {
      summary.unmatched += 1;
      continue;
    }

    const hg = r.fullTime.home;
    const ag = r.fullTime.away;
    const pen =
      r.duration === 'PENALTY_SHOOTOUT'
        ? r.winner === 'HOME_TEAM'
          ? ('H' as const)
          : r.winner === 'AWAY_TEAM'
            ? ('A' as const)
            : null
        : null;

    if (match.homeGoals !== null || match.awayGoals !== null) {
      const identical = match.homeGoals === hg && match.awayGoals === ag && match.penWinner === pen;
      if (identical) summary.unchanged += 1;
      else summary.skippedManual += 1; // no pisar la captura manual
      continue;
    }

    await repo.setResult(match.id, hg, ag, pen);
    summary.updated += 1;
  }
  return summary;
}

// --- Proveedor real: football-data.org v4 ---------------------------------

// Partido crudo del proveedor (lo que devuelve /competitions/WC/matches).
export interface ProviderRawMatch {
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: { tla?: string | null; name?: string | null };
  awayTeam: { tla?: string | null; name?: string | null };
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
    fullTime: { home: number | null; away: number | null };
  };
}

/** Finalizados con marcador → forma que consume runSync (goles). */
export function selectFinished(all: ProviderRawMatch[]): ProviderMatch[] {
  return all
    .filter((m) => m.status === 'FINISHED' && m.score.fullTime.home !== null)
    .map((m) => ({
      homeTla: m.homeTeam.tla ?? null,
      awayTla: m.awayTeam.tla ?? null,
      utcDate: m.utcDate,
      fullTime: { home: m.score.fullTime.home!, away: m.score.fullTime.away! },
      duration: m.score.duration,
      winner: m.score.winner,
    }));
}

/** Cruces de fase KO con ambos equipos definidos → forma que consume la asignación. */
export function selectKnockoutFixtures(all: ProviderRawMatch[]): ProviderFixture[] {
  return all
    .filter((m) => mapFdStage(m.stage) !== null && Boolean(m.homeTeam?.tla) && Boolean(m.awayTeam?.tla))
    .map((m) => ({ utcDate: m.utcDate, stage: m.stage, homeTeam: m.homeTeam, awayTeam: m.awayTeam }));
}

export class FootballDataProvider implements ResultsProvider {
  constructor(private readonly token: string) {}

  async fetchAll(): Promise<ProviderRawMatch[]> {
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': this.token },
      cache: 'no-store',
    });
    if (res.status === 429) {
      throw new Error(
        'football-data.org limita el plan gratuito a 10 consultas por minuto — espera un minuto y reintenta.',
      );
    }
    if (!res.ok) throw new Error(`football-data.org respondió ${res.status}`);
    const data = (await res.json()) as { matches?: ProviderRawMatch[] };
    return data.matches ?? [];
  }

  async fetchFinished(): Promise<ProviderMatch[]> {
    return selectFinished(await this.fetchAll());
  }
}

export function prismaSyncRepo(db: PrismaClient): SyncRepo {
  return {
    async getSyncableMatches() {
      const rows = await db.match.findMany({
        select: {
          id: true,
          kickoffUtc: true,
          isKnockout: true,
          homeCode: true,
          awayCode: true,
          homeGoals: true,
          awayGoals: true,
          penWinner: true,
        },
      });
      return rows;
    },
    async setResult(matchId, hg, ag, penWinner) {
      await db.match.update({
        where: { id: matchId },
        data: { homeGoals: hg, awayGoals: ag, penWinner },
      });
    },
  };
}

export function getResultsProvider(): ResultsProvider | null {
  const token = env.footballDataToken;
  return token ? new FootballDataProvider(token) : null;
}
