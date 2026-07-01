import type { PrismaClient } from '@prisma/client';
import { env } from '@/server/env';
import { mapFdStage, planKnockoutAssignments, type Llave, type ProviderFixture } from '@/domain/knockout-assign';
import type { EmailSender } from '@/server/email/sender';
import { knockoutAssignedEmail } from '@/server/email/templates';
import { computeAdvancement, type AdvanceInput } from '@/domain/bracket-topology';

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

// --- Auto-asignación de equipos de eliminatoria ---------------------------

export interface KnockoutAssignRepo {
  getKnockoutLlaves(): Promise<Llave[]>;
  getKnownTeamCodes(): Promise<Set<string>>;
  assignTeams(id: number, home: string, away: string, kickoffUtc: Date): Promise<void>;
}

export interface KnockoutAssignResult {
  assigned: Array<{ matchId: number; stage: string; homeCode: string; awayCode: string }>;
  anomalies: string[];
}

// Conservador: solo escribe casilleros vacíos (status 'assign'). Idempotente.
export async function runKnockoutAutoAssign(
  repo: KnockoutAssignRepo,
  fixtures: ProviderFixture[],
  now: Date,
): Promise<KnockoutAssignResult> {
  const [llaves, knownCodes] = await Promise.all([repo.getKnockoutLlaves(), repo.getKnownTeamCodes()]);
  const plan = planKnockoutAssignments(fixtures, llaves, knownCodes, now);

  const assigned: KnockoutAssignResult['assigned'] = [];
  for (const r of plan.rows) {
    if (r.status !== 'assign') continue;
    await repo.assignTeams(r.matchId, r.homeCode, r.awayCode, r.kickoffUtc);
    assigned.push({ matchId: r.matchId, stage: r.stage, homeCode: r.homeCode, awayCode: r.awayCode });
  }
  return { assigned, anomalies: plan.anomalies };
}

export function prismaKnockoutAssignRepo(db: PrismaClient): KnockoutAssignRepo {
  return {
    async getKnockoutLlaves() {
      const rows = await db.match.findMany({
        where: { isKnockout: true },
        select: { id: true, stage: true, tag: true, homeCode: true, awayCode: true, kickoffUtc: true },
      });
      return rows.map((r) => ({ ...r, stage: r.stage as string }));
    },
    async getKnownTeamCodes() {
      const teams = await db.team.findMany({ select: { code: true } });
      return new Set(teams.map((t) => t.code));
    },
    async assignTeams(id, home, away, kickoffUtc) {
      await db.match.update({ where: { id }, data: { homeCode: home, awayCode: away, kickoffUtc } });
    },
  };
}

// --- Orquestación: goles + asignación + aviso -----------------------------

export interface FullSyncDeps {
  provider: ResultsProvider;
  syncRepo: SyncRepo;
  assignRepo: KnockoutAssignRepo;
  advanceRepo: KnockoutAdvanceRepo;
  reconcileRepo: KnockoutReconcileRepo;
  sender: EmailSender;
  adminEmails: string[];
  appUrl: string;
}

export interface FullSyncSummary {
  sync: SyncSummary;
  assign: KnockoutAssignResult;
  advance: KnockoutAdvanceResult;
  reconcile: KnockoutReconcilePlan;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'error');

export async function runFullSync(deps: FullSyncDeps, now: Date = new Date()): Promise<FullSyncSummary> {
  const all = await deps.provider.fetchAll();

  // Goles (sin cambios respecto a hoy).
  const sync = await runSync(deps.syncRepo, selectFinished(all));

  const koFixtures = selectKnockoutFixtures(all);
  // Solo R32 se siembra desde el proveedor; R16+ lo dueña el auto-avance.
  const r32Fixtures = koFixtures.filter((f) => mapFdStage(f.stage) === 'R32');

  // Asignación KO (solo R32), aislada: su fallo no rompe los goles.
  let assign: KnockoutAssignResult = { assigned: [], anomalies: [] };
  try {
    assign = await runKnockoutAutoAssign(deps.assignRepo, r32Fixtures, now);
  } catch (e) {
    assign = { assigned: [], anomalies: [`Fallo en auto-asignación R32: ${msg(e)}`] };
  }

  // Auto-avance R16+ derivado de la topología, aislado. Corre ANTES de reconciliar:
  // así los equipos ya están propagados cuando comparamos contra el proveedor.
  let advance: KnockoutAdvanceResult = { advanced: [], anomalies: [] };
  try {
    advance = await runKnockoutAdvance(deps.advanceRepo);
  } catch (e) {
    advance = { advanced: [], anomalies: [`Fallo en auto-avance: ${msg(e)}`] };
  }

  // Reconciliación R16+, aislada: adopta el kickoff real y avisa desajustes.
  let reconcile: KnockoutReconcilePlan = { kickoffUpdates: [], anomalies: [] };
  try {
    const rows = await deps.reconcileRepo.getKnockoutRows();
    reconcile = planKnockoutReconcile(rows, koFixtures);
    for (const u of reconcile.kickoffUpdates) await deps.reconcileRepo.updateKickoff(u.matchId, u.utc);
  } catch (e) {
    reconcile = { kickoffUpdates: [], anomalies: [`Fallo en reconciliación: ${msg(e)}`] };
  }

  // Aviso best-effort: si hubo novedades o anomalías en cualquiera de los pasos KO.
  const hasNews =
    assign.assigned.length > 0 ||
    assign.anomalies.length > 0 ||
    advance.advanced.length > 0 ||
    advance.anomalies.length > 0 ||
    reconcile.anomalies.length > 0;
  if (hasNews && deps.adminEmails.length > 0) {
    try {
      const anomalies = [...assign.anomalies, ...advance.anomalies, ...reconcile.anomalies];
      const { subject, html } = knockoutAssignedEmail(assign.assigned, anomalies, deps.appUrl, advance.advanced);
      await deps.sender.send(deps.adminEmails, subject, html);
    } catch (e) {
      console.error('No se pudo enviar el aviso de auto-asignación:', e);
    }
  }

  return { sync, assign, advance, reconcile };
}

export function getResultsProvider(): ResultsProvider | null {
  const token = env.footballDataToken;
  return token ? new FootballDataProvider(token) : null;
}

// --- Auto-avance de eliminatoria (R16+) ------------------------------------

export interface AdvanceDbMatch {
  id: number; stage: string; isKnockout: boolean;
  homeCode: string | null; awayCode: string | null;
  homeGoals: number | null; awayGoals: number | null; penWinner: 'H' | 'A' | null;
  hasPicks: boolean;
}
export interface KnockoutAdvanceRepo {
  getKnockoutMatches(): Promise<AdvanceDbMatch[]>;
  setSlotTeam(matchId: number, slot: 'H' | 'A', teamCode: string): Promise<void>;
}
export interface KnockoutAdvanceResult {
  advanced: Array<{ matchId: number; slot: 'H' | 'A'; teamCode: string }>;
  anomalies: string[];
}

// Conservador: llena/actualiza casilleros R16+ derivados; nunca pisa uno con
// picks/resultado y equipo distinto (eso es anomalía). Idempotente.
export async function runKnockoutAdvance(repo: KnockoutAdvanceRepo): Promise<KnockoutAdvanceResult> {
  const rows = await repo.getKnockoutMatches();
  const inputs: AdvanceInput[] = rows.map((m) => ({
    id: m.id, stage: m.stage, isKnockout: m.isKnockout, homeCode: m.homeCode, awayCode: m.awayCode,
    result: m.homeGoals !== null && m.awayGoals !== null
      ? { homeGoals: m.homeGoals, awayGoals: m.awayGoals, penWinner: m.penWinner } : null,
  }));
  const { writes, anomalies } = computeAdvancement(inputs);
  const byId = new Map(rows.map((m) => [m.id, m]));
  const advanced: KnockoutAdvanceResult['advanced'] = [];

  for (const w of writes) {
    const target = byId.get(w.matchId);
    if (!target) { anomalies.push(`Destino ${w.matchId} no existe.`); continue; }
    const current = w.slot === 'H' ? target.homeCode : target.awayCode;
    if (current === w.teamCode) continue; // idempotente
    if (current !== null) {
      const hasResult = target.homeGoals !== null;
      if (target.hasPicks || hasResult) {
        anomalies.push(`m${w.matchId} lado ${w.slot}: topología dice ${w.teamCode} pero ya hay ${current} con picks/resultado — revisa Admin.`);
        continue;
      }
      // stale (sembrado por proveedor sin picks) → se sobrescribe
    }
    await repo.setSlotTeam(w.matchId, w.slot, w.teamCode);
    if (w.slot === 'H') target.homeCode = w.teamCode; else target.awayCode = w.teamCode;
    advanced.push(w);
  }
  return { advanced, anomalies };
}

const R16_PLUS = new Set(['R16', 'QF', 'SF', 'FIN']);
const setKey = (a: string, b: string) => [a, b].slice().sort().join('|');

export interface ReconcileRow {
  id: number; stage: string; homeCode: string | null; awayCode: string | null; kickoffUtc: Date;
}
export interface KnockoutReconcilePlan {
  kickoffUpdates: Array<{ matchId: number; utc: Date }>;
  anomalies: string[];
}

// Red de seguridad: el proveedor sigue publicando cruces R16+. No los usamos para
// llenar (eso lo hace el auto-avance), pero SÍ para (a) adoptar el kickoff real y
// (b) avisar si un cruce del proveedor no cuadra con lo que derivó la topología.
export function planKnockoutReconcile(rows: ReconcileRow[], fixtures: ProviderFixture[]): KnockoutReconcilePlan {
  const kickoffUpdates: KnockoutReconcilePlan['kickoffUpdates'] = [];
  const anomalies: string[] = [];
  const ours = rows.filter((r) => R16_PLUS.has(r.stage) && r.homeCode && r.awayCode);
  const byPair = new Map(ours.map((r) => [setKey(r.homeCode!, r.awayCode!), r]));

  for (const f of fixtures) {
    const ourStage = mapFdStage(f.stage);
    if (!ourStage || !R16_PLUS.has(ourStage)) continue;
    const home = f.homeTeam?.tla, away = f.awayTeam?.tla;
    if (!home || !away) continue;
    const match = byPair.get(setKey(home, away));
    if (match) {
      const utc = new Date(f.utcDate);
      if (utc.getTime() !== match.kickoffUtc.getTime()) kickoffUpdates.push({ matchId: match.id, utc });
    } else {
      // El proveedor publica este cruce pero no lo tenemos igual en R16+.
      const placed = ours.filter((r) => r.homeCode === home || r.awayCode === home || r.homeCode === away || r.awayCode === away);
      if (placed.length > 0) {
        anomalies.push(`${ourStage}: el proveedor publica ${home} vs ${away} que no cuadra con la topología — revisa Admin.`);
      }
    }
  }
  return { kickoffUpdates, anomalies };
}

export interface KnockoutReconcileRepo {
  getKnockoutRows(): Promise<ReconcileRow[]>;
  updateKickoff(matchId: number, utc: Date): Promise<void>;
}

export function prismaKnockoutReconcileRepo(db: PrismaClient): KnockoutReconcileRepo {
  return {
    async getKnockoutRows() {
      const rows = await db.match.findMany({
        where: { isKnockout: true },
        select: { id: true, stage: true, homeCode: true, awayCode: true, kickoffUtc: true },
      });
      return rows.map((r) => ({ ...r, stage: r.stage as string }));
    },
    async updateKickoff(matchId, utc) {
      await db.match.update({ where: { id: matchId }, data: { kickoffUtc: utc } });
    },
  };
}

export function prismaKnockoutAdvanceRepo(db: PrismaClient): KnockoutAdvanceRepo {
  return {
    async getKnockoutMatches() {
      const rows = await db.match.findMany({
        where: { isKnockout: true },
        select: {
          id: true, stage: true, isKnockout: true, homeCode: true, awayCode: true,
          homeGoals: true, awayGoals: true, penWinner: true, _count: { select: { picks: true } },
        },
      });
      return rows.map(({ _count, ...r }) => ({ ...r, stage: r.stage as string, hasPicks: _count.picks > 0 }));
    },
    async setSlotTeam(matchId, slot, teamCode) {
      await db.match.update({ where: { id: matchId }, data: slot === 'H' ? { homeCode: teamCode } : { awayCode: teamCode } });
    },
  };
}
