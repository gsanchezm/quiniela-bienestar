'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import { confirmUserManually } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';

export interface ConfirmUserResult {
  ok?: boolean;
  error?: string;
}

// Confirmación manual (solo admin): para jugadores a los que no les llega
// el correo de confirmación (p. ej. Resend sin dominio verificado).
export async function confirmUserAction(userId: string): Promise<ConfirmUserResult> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.email)) return { error: 'Solo administradores.' };
  const user = await db.user.findUnique({ where: { id: userId }, select: { confirmed: true } });
  if (!user) return { error: 'Ese jugador ya no existe.' };
  if (!user.confirmed) await confirmUserManually(realAuthDeps(), userId);
  revalidatePath('/resultados');
  return { ok: true };
}
