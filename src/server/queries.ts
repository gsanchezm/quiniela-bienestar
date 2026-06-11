// Lecturas para las páginas (RSC). La privacidad se aplica AQUÍ: los picks
// ajenos de partidos abiertos nunca salen del servidor.
import { db } from '@/server/db';
import { isLocked } from '@/domain/lock';
import { matchOutcome, scorePick } from '@/domain/scoring';
import { computeStandings, type FinishedMatch, type PicksByUser } from '@/domain/standings';
import { canSeePick } from '@/server/services/privacy';
import type { MatchResult, Outcome, PickScore, PickValue } from '@/domain/types';

export interface TeamView {
  code: string;
  name: string;
  flag: string;
}

export interface MatchView {
  id: number;
  stage: string;
  group: string | null;
  tag: string | null;
  isKnockout: boolean;
  home: TeamView | null;
  away: TeamView | null;
  kickoffUtc: string; // ISO — el cliente la muestra en hora local
  locked: boolean;
  result: MatchResult | null;
  outcome: Outcome | null;
  myPick: PickValue | null;
  myScore: PickScore | null;
}

const matchInclude = {
  home: { select: { code: true, name: true, flag: true } },
  away: { select: { code: true, name: true, flag: true } },
} as const;

type DbMatch = {
  id: number;
  stage: string;
  group: string | null;
  tag: string | null;
  isKnockout: boolean;
  kickoffUtc: Date;
  homeGoals: number | null;
  awayGoals: number | null;
  penWinner: 'H' | 'A' | null;
  home: TeamView | null;
  away: TeamView | null;
};

function resultOf(m: DbMatch): MatchResult | null {
  if (m.homeGoals === null || m.awayGoals === null) return null;
  return { homeGoals: m.homeGoals, awayGoals: m.awayGoals, penWinner: m.penWinner };
}

function toView(m: DbMatch, pick: PickValue | null, now: Date): MatchView {
  const result = resultOf(m);
  const outcome = result ? matchOutcome(result, m.isKnockout) : null;
  return {
    id: m.id,
    stage: m.stage,
    group: m.group,
    tag: m.tag,
    isKnockout: m.isKnockout,
    home: m.home,
    away: m.away,
    kickoffUtc: m.kickoffUtc.toISOString(),
    locked: isLocked(m.kickoffUtc, now),
    result,
    outcome,
    myPick: pick,
    myScore: pick && result ? scorePick(pick, result, m.isKnockout) : null,
  };
}

export async function getMatchesForUser(userId: string, now: Date = new Date()): Promise<MatchView[]> {
  const [matches, picks] = await Promise.all([
    db.match.findMany({ include: matchInclude, orderBy: { id: 'asc' } }),
    db.pick.findMany({
      where: { userId },
      select: { matchId: true, outcome: true, predHome: true, predAway: true },
    }),
  ]);
  const byMatch = new Map(picks.map((p) => [p.matchId, p]));
  return matches.map((m) => {
    const p = byMatch.get(m.id);
    return toView(m, p ? { outcome: p.outcome, predHome: p.predHome, predAway: p.predAway } : null, now);
  });
}

export interface StandingsRowView {
  user: { id: string; nombre: string; apellido: string; photo: string | null; color: string };
  points: number;
  aciertos: number;
  exactos: number;
  jugados: number;
  totalPicks: number;
}

export async function getStandingsView(): Promise<StandingsRowView[]> {
  const [users, matches, picks] = await Promise.all([
    db.user.findMany({
      where: { confirmed: true },
      select: { id: true, nombre: true, apellido: true, photo: true, color: true },
    }),
    db.match.findMany({
      where: { homeGoals: { not: null }, awayGoals: { not: null } },
      select: { id: true, isKnockout: true, homeGoals: true, awayGoals: true, penWinner: true },
    }),
    db.pick.findMany({
      select: { userId: true, matchId: true, outcome: true, predHome: true, predAway: true },
    }),
  ]);

  // Un KO empatado sin ganador de penales capturado aún no cuenta como jugado.
  const finished: FinishedMatch[] = matches
    .map((m) => ({
      id: m.id,
      isKnockout: m.isKnockout,
      result: { homeGoals: m.homeGoals!, awayGoals: m.awayGoals!, penWinner: m.penWinner },
    }))
    .filter((m) => matchOutcome(m.result, m.isKnockout) !== null);

  const picksByUser: PicksByUser = {};
  for (const p of picks) {
    (picksByUser[p.userId] ??= {})[p.matchId] = {
      outcome: p.outcome,
      predHome: p.predHome,
      predAway: p.predAway,
    };
  }

  const byId = new Map(users.map((u) => [u.id, u]));
  return computeStandings(users, finished, picksByUser).map((r) => ({
    user: byId.get(r.userId)!,
    points: r.points,
    aciertos: r.aciertos,
    exactos: r.exactos,
    jugados: r.jugados,
    totalPicks: r.totalPicks,
  }));
}

export interface PlayerPickRowView {
  match: MatchView; // myPick/myScore = los del jugador consultado (si son visibles)
  hidden: boolean;
}

export interface PlayerPicksView {
  owner: { id: string; nombre: string; apellido: string; photo: string | null; color: string };
  rows: PlayerPickRowView[];
}

export async function getPlayerPicksView(
  ownerId: string,
  viewerId: string,
  now: Date = new Date(),
): Promise<PlayerPicksView | null> {
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: { id: true, nombre: true, apellido: true, photo: true, color: true, confirmed: true },
  });
  if (!owner || !owner.confirmed) return null;

  const [matches, picks] = await Promise.all([
    db.match.findMany({ include: matchInclude, orderBy: { id: 'asc' } }),
    db.pick.findMany({
      where: { userId: ownerId },
      select: { matchId: true, outcome: true, predHome: true, predAway: true },
    }),
  ]);
  const byMatch = new Map(picks.map((p) => [p.matchId, p]));

  const rows = matches.map((m) => {
    const visible = canSeePick(viewerId, ownerId, m.kickoffUtc, now);
    const p = visible ? byMatch.get(m.id) : undefined;
    return {
      match: toView(m, p ? { outcome: p.outcome, predHome: p.predHome, predAway: p.predAway } : null, now),
      hidden: !visible,
    };
  });

  const { confirmed: _omit, ...ownerView } = owner;
  return { owner: ownerView, rows };
}
