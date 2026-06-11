'use server';

import { redirect } from 'next/navigation';
import { AuthError, login, requestPasswordReset, resetPassword, signup } from '@/server/services/auth';
import { realAuthDeps } from '@/server/services/auth-deps';
import { createSession, destroySession } from '@/server/auth/session';

export interface FormState {
  ok?: boolean;
  error?: string;
  email?: string;
}

const field = (fd: FormData, name: string) => String(fd.get(name) ?? '');

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, 'email');
  try {
    await signup(realAuthDeps(), {
      nombre: field(formData, 'nombre'),
      apellido: field(formData, 'apellido'),
      email,
      password: field(formData, 'password'),
    });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  return { ok: true, email: email.trim().toLowerCase() };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let userId: string;
  try {
    const user = await login(realAuthDeps(), field(formData, 'email'), field(formData, 'password'));
    userId = user.id;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await createSession(userId);
  redirect('/partidos');
}

export async function forgotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requestPasswordReset(realAuthDeps(), field(formData, 'email'));
  // Respuesta neutra: no revela si el correo existe.
  return { ok: true };
}

export async function resetAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
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
