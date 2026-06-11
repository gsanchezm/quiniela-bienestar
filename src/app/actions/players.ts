'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin, isSuperAdmin } from '@/server/admin';
import { issueToken } from '@/server/auth/tokens';
import { confirmUserManually } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';
import {
  PlayerError,
  assertManageable,
  deletePlayer,
  prismaPlayersRepo,
  setPlayerAdmin,
} from '@/server/services/players';

export interface PlayerActionResult {
  ok?: boolean;
  error?: string;
  resetUrl?: string;
}

class Forbidden extends Error {}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) throw new Forbidden('Solo administradores.');
  return user;
}

function refresh() {
  revalidatePath('/jugadores');
  revalidatePath('/tabla');
  revalidatePath('/resultados');
}

async function runPlayerAction(fn: () => Promise<void>): Promise<PlayerActionResult> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof PlayerError || e instanceof Forbidden) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

// Confirmación manual: para cuentas a las que no les llega el correo.
export async function confirmPlayerAction(userId: string): Promise<PlayerActionResult> {
  return runPlayerAction(async () => {
    await requireAdmin();
    const user = await db.user.findUnique({ where: { id: userId }, select: { confirmed: true } });
    if (!user) throw new PlayerError('Ese jugador ya no existe.');
    if (!user.confirmed) await confirmUserManually(realAuthDeps(), userId);
  });
}

// Borrado definitivo: la cuenta y todos sus picks (cascade en el esquema).
export async function deletePlayerAction(userId: string): Promise<PlayerActionResult> {
  return runPlayerAction(async () => {
    const me = await requireAdmin();
    await deletePlayer(prismaPlayersRepo(db), me.id, userId, isSuperAdmin);
  });
}

export async function setPlayerAdminAction(userId: string, makeAdmin: boolean): Promise<PlayerActionResult> {
  return runPlayerAction(async () => {
    const me = await requireAdmin();
    await setPlayerAdmin(prismaPlayersRepo(db), me.id, userId, makeAdmin, isSuperAdmin);
  });
}

// Genera un enlace de restablecimiento (2 h) que el admin comparte por
// WhatsApp; el jugador elige su contraseña y el admin nunca la conoce.
export async function adminResetLinkAction(userId: string): Promise<PlayerActionResult> {
  try {
    const me = await requireAdmin();
    await assertManageable(prismaPlayersRepo(db), me.id, userId, isSuperAdmin);
    const raw = await issueToken(userId, 'RESET');
    return { ok: true, resetUrl: `${env.appUrl}/reset/${raw}` };
  } catch (e) {
    if (e instanceof PlayerError || e instanceof Forbidden) return { error: e.message };
    throw e;
  }
}
