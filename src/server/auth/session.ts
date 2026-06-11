import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { hashToken, newToken } from '@/server/crypto';

const COOKIE = 'qdb_session';
const DURATION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const raw = newToken();
  const expiresAt = new Date(Date.now() + DURATION_DAYS * 86_400_000);
  await db.session.create({ data: { token: hashToken(raw), userId, expiresAt } });
  (await cookies()).set(COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function getSessionUser() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const session = await db.session.findUnique({
    where: { token: hashToken(raw) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token: session.token } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) await db.session.deleteMany({ where: { token: hashToken(raw) } });
  jar.delete(COOKIE);
}

// Al cambiar la contraseña desde el perfil: cierra las demás sesiones
// (otros dispositivos) pero conserva la actual.
export async function revokeOtherSessions(userId: string): Promise<void> {
  const raw = (await cookies()).get(COOKIE)?.value;
  await db.session.deleteMany({
    where: { userId, ...(raw ? { NOT: { token: hashToken(raw) } } : {}) },
  });
}
