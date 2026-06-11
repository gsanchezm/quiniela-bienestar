import type { PrismaClient } from '@prisma/client';
import { isLocked } from '@/domain/lock';
import { impliedOutcome } from '@/domain/scoring';
import { outcomeSchema, scorePredictionSchema } from '@/domain/validation';
import type { Outcome, PickValue } from '@/domain/types';

export class PickError extends Error {}

export interface PickMatch {
  id: number;
  kickoffUtc: Date;
  isKnockout: boolean;
  homeCode: string | null;
  awayCode: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
}

// Puerto mínimo (DIP): los tests usan un fake; producción usa prismaPicksRepo.
export interface PicksRepo {
  getMatch(id: number): Promise<PickMatch | null>;
  getPick(userId: string, matchId: number): Promise<PickValue | null>;
  upsertPick(userId: string, matchId: number, value: PickValue): Promise<void>;
  deletePick(userId: string, matchId: number): Promise<void>;
}

const EMPTY: PickValue = { outcome: null, predHome: null, predAway: null };

// Reglas comunes: existe, tiene equipos y sigue abierto (spec §4.1).
async function openMatch(repo: PicksRepo, matchId: number, now: Date): Promise<PickMatch> {
  const m = await repo.getMatch(matchId);
  if (!m) throw new PickError('El partido no existe.');
  if (m.isKnockout && (!m.homeCode || !m.awayCode)) {
    throw new PickError('Equipos por definir al cerrar la fase anterior.');
  }
  if (isLocked(m.kickoffUtc, now)) throw new PickError('Los picks de este partido ya cerraron.');
  // Defensa extra: con resultado capturado (aunque el reloj diga otra cosa,
  // p. ej. una captura adelantada del admin) ya nadie puede mover su pick.
  if (m.homeGoals !== null || m.awayGoals !== null) {
    throw new PickError('Este partido ya tiene resultado.');
  }
  return m;
}

export async function setOutcome(
  repo: PicksRepo,
  userId: string,
  matchId: number,
  outcome: Outcome,
  now: Date = new Date(),
): Promise<void> {
  const m = await openMatch(repo, matchId, now);
  if (!outcomeSchema(m.isKnockout).safeParse(outcome).success) {
    throw new PickError('Pick inválido para este partido.');
  }
  const cur = (await repo.getPick(userId, matchId)) ?? EMPTY;
  if (cur.outcome === outcome) {
    // Toggle: repetir el pick lo des-selecciona.
    if (cur.predHome === null && cur.predAway === null) {
      await repo.deletePick(userId, matchId);
    } else {
      await repo.upsertPick(userId, matchId, { ...cur, outcome: null });
    }
    return;
  }
  await repo.upsertPick(userId, matchId, { ...cur, outcome });
}

export async function setScorePrediction(
  repo: PicksRepo,
  userId: string,
  matchId: number,
  predHome: number,
  predAway: number,
  now: Date = new Date(),
): Promise<void> {
  const m = await openMatch(repo, matchId, now);
  const parsed = scorePredictionSchema.safeParse({ predHome, predAway });
  if (!parsed.success) throw new PickError(parsed.error.issues[0].message);

  const cur = (await repo.getPick(userId, matchId)) ?? EMPTY;
  // Auto-pick implícito si aún no eligió; en KO un empate no decide ganador.
  const outcome = cur.outcome ?? impliedOutcome(predHome, predAway, m.isKnockout);
  await repo.upsertPick(userId, matchId, { outcome, predHome, predAway });
}

export async function clearScorePrediction(
  repo: PicksRepo,
  userId: string,
  matchId: number,
  now: Date = new Date(),
): Promise<void> {
  await openMatch(repo, matchId, now);
  const cur = await repo.getPick(userId, matchId);
  if (!cur) return;
  if (cur.outcome === null) {
    await repo.deletePick(userId, matchId);
  } else {
    await repo.upsertPick(userId, matchId, { ...cur, predHome: null, predAway: null });
  }
}

export function prismaPicksRepo(db: PrismaClient): PicksRepo {
  return {
    async getMatch(id) {
      return db.match.findUnique({
        where: { id },
        select: {
          id: true,
          kickoffUtc: true,
          isKnockout: true,
          homeCode: true,
          awayCode: true,
          homeGoals: true,
          awayGoals: true,
        },
      });
    },
    async getPick(userId, matchId) {
      const p = await db.pick.findUnique({
        where: { userId_matchId: { userId, matchId } },
        select: { outcome: true, predHome: true, predAway: true },
      });
      return p ?? null;
    },
    async upsertPick(userId, matchId, value) {
      await db.pick.upsert({
        where: { userId_matchId: { userId, matchId } },
        update: value,
        create: { userId, matchId, ...value },
      });
    },
    async deletePick(userId, matchId) {
      await db.pick.deleteMany({ where: { userId, matchId } });
    },
  };
}
