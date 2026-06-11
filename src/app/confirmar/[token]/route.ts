import { redirect } from 'next/navigation';
import { confirmAccount } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';
import { createSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

// Enlace del correo de confirmación: confirma, inicia sesión y a la cancha.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await confirmAccount(realAuthDeps(), token);
  if (!userId) redirect('/login?aviso=enlace-invalido');
  await createSession(userId);
  redirect('/partidos');
}
