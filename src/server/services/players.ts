import type { PrismaClient } from '@prisma/client';

export class PlayerError extends Error {}

export interface PlayerInfo {
  id: string;
  email: string;
  isAdmin: boolean;
  confirmed: boolean;
}

export interface PlayersRepo {
  getPlayer(id: string): Promise<PlayerInfo | null>;
  deletePlayer(id: string): Promise<void>; // cascade: picks/sesiones/tokens
  setAdmin(id: string, isAdmin: boolean): Promise<void>;
}

type SuperCheck = (email: string) => boolean;

// Guard común: ni a ti mismo, ni a super-admins, ni a fantasmas.
export async function assertManageable(
  repo: PlayersRepo,
  actorId: string,
  targetId: string,
  superCheck: SuperCheck,
) {
  return target(repo, actorId, targetId, superCheck);
}

async function target(repo: PlayersRepo, actorId: string, targetId: string, superCheck: SuperCheck) {
  if (actorId === targetId) throw new PlayerError('No puedes aplicarte esta acción a ti mismo.');
  const player = await repo.getPlayer(targetId);
  if (!player) throw new PlayerError('Ese jugador ya no existe.');
  if (superCheck(player.email)) {
    throw new PlayerError('Los super-admins (ADMIN_EMAILS) no se pueden modificar desde aquí.');
  }
  return player;
}

export async function deletePlayer(
  repo: PlayersRepo,
  actorId: string,
  targetId: string,
  superCheck: SuperCheck,
): Promise<void> {
  await target(repo, actorId, targetId, superCheck);
  await repo.deletePlayer(targetId);
}

export async function setPlayerAdmin(
  repo: PlayersRepo,
  actorId: string,
  targetId: string,
  makeAdmin: boolean,
  superCheck: SuperCheck,
): Promise<void> {
  await target(repo, actorId, targetId, superCheck);
  await repo.setAdmin(targetId, makeAdmin);
}

export function prismaPlayersRepo(db: PrismaClient): PlayersRepo {
  return {
    async getPlayer(id) {
      return db.user.findUnique({
        where: { id },
        select: { id: true, email: true, isAdmin: true, confirmed: true },
      });
    },
    async deletePlayer(id) {
      await db.user.delete({ where: { id } });
    },
    async setAdmin(id, isAdmin) {
      await db.user.update({ where: { id }, data: { isAdmin } });
    },
  };
}
