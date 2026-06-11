'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError, login, requestPasswordReset, resetPassword, signup } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';
import { createSession, destroySession } from '@/server/auth/session';
import { clearRateLimit, rateLimit } from '@/server/security/rate-limit';

export interface FormState {
  ok?: boolean;
  error?: string;
  email?: string;
  userId?: string; // post-registro: para que la pantalla detecte la activación
}

const field = (fd: FormData, name: string) => String(fd.get(name) ?? '');

const MIN = 60_000;
const RATE_MSG = 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.';

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, 'email');
  if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * MIN).ok) return { error: RATE_MSG };
  let userId: string;
  try {
    const user = await signup(realAuthDeps(), {
      nombre: field(formData, 'nombre'),
      apellido: field(formData, 'apellido'),
      email,
      password: field(formData, 'password'),
    });
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  return { ok: true, email: email.trim().toLowerCase(), userId };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, 'email').trim().toLowerCase();
  const rlKey = `login:${await clientIp()}:${email}`;
  if (!rateLimit(rlKey, 5, 15 * MIN).ok) return { error: RATE_MSG };

  let userId: string;
  try {
    const user = await login(realAuthDeps(), email, field(formData, 'password'));
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) {
      // Contraseña correcta pero cuenta sin activar: no cuenta como intento
      // fallido — el jugador suele reintentar mientras espera al admin.
      if (e.message.includes('no está confirmada')) clearRateLimit(rlKey);
      // Regresa el correo para que el reset de formularios de React 19
      // no se lo borre al usuario tras un error.
      return { error: e.message, email };
    }
    throw e;
  }
  clearRateLimit(rlKey); // login correcto: el contador se libera
  await createSession(userId);
  redirect('/partidos');
}

export async function forgotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // 3 por cuarto de hora por IP: frena el spam de correos de reset.
  if (!rateLimit(`forgot:${await clientIp()}`, 3, 15 * MIN).ok) return { error: RATE_MSG };
  await requestPasswordReset(realAuthDeps(), field(formData, 'email'));
  // Respuesta neutra: no revela si el correo existe.
  return { ok: true };
}

export async function resetAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!rateLimit(`reset:${await clientIp()}`, 5, 15 * MIN).ok) return { error: RATE_MSG };
  const p1 = field(formData, 'password');
  const p2 = field(formData, 'password2');
  if (p1.length < 6) return { error: 'Mínimo 6 caracteres.' };
  if (p1 !== p2) return { error: 'Las contraseñas no coinciden.' };
  try {
    const ok = await resetPassword(realAuthDeps(), token, p1);
    if (!ok) return { error: 'El enlace ya no es válido. Solicita uno nuevo.' };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}
