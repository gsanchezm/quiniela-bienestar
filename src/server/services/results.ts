import type { PrismaClient } from '@prisma/client';
import { isLocked } from '@/domain/lock';
import { resultSchema } from '@/domain/validation';

export class ResultError extends Error {}

export interface ResultsMatch {
  id: number;
  kickoffUtc: Date;
  isKnockout: boolean;
  homeCode: string | null;
  awayCode: string | null;
}

export interface ResultsRepo {
  getMatch(id: number): Promise<ResultsMatch | null>;
  setResult(matchId: number, hg: number, ag: number, penWinner: 'H' | 'A' | null): Promise<void>;
  clearResult(matchId: number): Promise<void>;
  setTeams(matchId: number, homeCode: string, awayCode: string): Promise<void>;
  deletePicksForMatch(matchId: number): Promise<void>;
}

export interface ResultInput {
  homeGoals: number;
  awayGoals: number;
  penWinner: 'H' | 'A' | null;
}

export async function saveResult(repo: ResultsRepo, matchId: number, input: ResultInput): Promise<void> {
  const m = await repo.getMatch(matchId);
  if (!m) throw new ResultError('El partido no existe.');
  if (!m.homeCode || !m.awayCode) throw new ResultError('Asigna los equipos de la llave primero.');
  const parsed = resultSchema(m.isKnockout).safeParse(input);
  if (!parsed.success) throw new ResultError(parsed.error.issues[0].message);
  await repo.setResult(matchId, input.homeGoals, input.awayGoals, input.penWinner);
}

export async function removeResult(repo: ResultsRepo, matchId: number): Promise<void> {
  const m = await repo.getMatch(matchId);
  if (!m) throw new ResultError('El partido no existe.');
  await repo.clearResult(matchId);
}

// Asignar/cambiar equipos de una llave. Si la llave ya tenía equipos y
// cambian, se borran los picks afectados para que la gente vuelva a elegir
// (decisión de producto, spec §4.4).
export async function assignKnockoutTeams(
  repo: ResultsRepo,
  matchId: number,
  homeCode: string,
  awayCode: string,
  now: Date = new Date(),
): Promise<void> {
  const m = await repo.getMatch(matchId);
  if (!m) throw new ResultError('El partido no existe.');
  if (!m.isKnockout) throw new ResultError('Los equipos de fase de grupos son fijos.');
  if (!homeCode || !awayCode || homeCode === awayCode) {
    throw new ResultError('Elige dos equipos distintos.');
  }
  if (isLocked(m.kickoffUtc, now)) throw new ResultError('La llave ya inició; no se puede cambiar.');
  if (m.homeCode === homeCode && m.awayCode === awayCode) return; // sin cambios

  const teníaEquipos = m.homeCode !== null || m.awayCode !== null;
  if (teníaEquipos) await repo.deletePicksForMatch(matchId);
  await repo.setTeams(matchId, homeCode, awayCode);
}

export function prismaResultsRepo(db: PrismaClient): ResultsRepo {
  return {
    async getMatch(id) {
      return db.match.findUnique({
        where: { id },
        select: { id: true, kickoffUtc: true, isKnockout: true, homeCode: true, awayCode: true },
      });
    },
    async setResult(matchId, hg, ag, penWinner) {
      await db.match.update({
        where: { id: matchId },
        data: { homeGoals: hg, awayGoals: ag, penWinner },
      });
    },
    async clearResult(matchId) {
      await db.match.update({
        where: { id: matchId },
        data: { homeGoals: null, awayGoals: null, penWinner: null },
      });
    },
    async setTeams(matchId, homeCode, awayCode) {
      await db.match.update({ where: { id: matchId }, data: { homeCode, awayCode } });
    },
    async deletePicksForMatch(matchId) {
      await db.pick.deleteMany({ where: { matchId } });
    },
  };
}
