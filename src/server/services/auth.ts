import { signupSchema } from '@/domain/validation';
import type { EmailSender } from '@/server/email/sender';
import { confirmEmail, resetEmail, changeEmailEmail } from '@/server/email/templates';

export class AuthError extends Error {}

export interface AuthUser {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  passwordHash: string;
  confirmed: boolean;
  color: string;
  photo: string | null;
}

// Dependencias inyectables: los tests usan fakes; producción usa realAuthDeps()
// (en src/server/services/auth-deps.ts para no arrastrar Prisma a los tests).
export interface AuthDeps {
  users: {
    findByEmail(email: string): Promise<AuthUser | null>;
    findById(id: string): Promise<AuthUser | null>;
    create(data: {
      nombre: string;
      apellido: string;
      email: string;
      passwordHash: string;
      color: string;
    }): Promise<AuthUser>;
    update(id: string, data: Partial<Omit<AuthUser, 'id'>>): Promise<void>;
  };
  tokens: {
    issue(userId: string, type: 'CONFIRM' | 'RESET' | 'EMAIL_CHANGE', newEmail?: string): Promise<string>;
    consume(
      raw: string,
      type: 'CONFIRM' | 'RESET' | 'EMAIL_CHANGE',
    ): Promise<{ userId: string; newEmail: string | null } | null>;
  };
  sender: EmailSender;
  revokeSessions(userId: string): Promise<void>;
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
  appUrl: string;
}

// Paleta de avatares del prototipo (js/auth.jsx). Determinista por correo
// para que no dependa de aleatoriedad.
const AVATAR_COLORS = ['#e0a83c', '#5aa9e6', '#e26d5c', '#9d79bc', '#6cae75', '#d96fa8'];

function pickColor(email: string): string {
  let h = 2166136261;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface SignupInput {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
}

export async function signup(deps: AuthDeps, input: SignupInput): Promise<AuthUser> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message);
  const data = parsed.data;

  if (await deps.users.findByEmail(data.email)) {
    throw new AuthError('Ese correo ya está registrado.');
  }
  const user = await deps.users.create({
    nombre: data.nombre,
    apellido: data.apellido,
    email: data.email,
    passwordHash: await deps.hashPassword(data.password),
    color: pickColor(data.email),
  });
  const token = await deps.tokens.issue(user.id, 'CONFIRM');
  const mail = confirmEmail(`${deps.appUrl}/confirmar/${token}`);
  try {
    await deps.sender.send(user.email, mail.subject, mail.html);
  } catch (e) {
    // Sin dominio verificado (sandbox de Resend) el envío a terceros falla.
    // La cuenta queda pendiente y un admin puede confirmarla manualmente.
    console.warn(`No se pudo enviar el correo de confirmación a ${user.email}:`, e);
  }
  return user;
}

// Confirmación manual por un administrador (sin token): para cuando el
// correo de confirmación no puede llegar al jugador.
export async function confirmUserManually(deps: AuthDeps, userId: string): Promise<void> {
  await deps.users.update(userId, { confirmed: true });
}

// Hash señuelo: cuando el correo no existe se verifica igual, para que el
// tiempo de respuesta no delate qué correos están registrados.
let decoyHash: string | null = null;

export async function login(deps: AuthDeps, email: string, password: string): Promise<AuthUser> {
  const user = await deps.users.findByEmail(normalizeEmail(email));
  if (!decoyHash) decoyHash = await deps.hashPassword(newDecoySecret());
  const valid = await deps.verifyPassword(password, user?.passwordHash ?? decoyHash);
  if (!user || !valid) {
    throw new AuthError('Correo o contraseña incorrectos.');
  }
  if (!user.confirmed) {
    throw new AuthError('Tu cuenta aún no está confirmada. Revisa tu correo.');
  }
  return user;
}

function newDecoySecret(): string {
  return `decoy-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function confirmAccount(deps: AuthDeps, raw: string): Promise<string | null> {
  const t = await deps.tokens.consume(raw, 'CONFIRM');
  if (!t) return null;
  await deps.users.update(t.userId, { confirmed: true });
  return t.userId;
}

// Respuesta neutra: nunca revela si el correo existe (spec §4.5).
export async function requestPasswordReset(deps: AuthDeps, email: string): Promise<void> {
  const user = await deps.users.findByEmail(normalizeEmail(email));
  if (!user) return;
  const token = await deps.tokens.issue(user.id, 'RESET');
  const mail = resetEmail(`${deps.appUrl}/reset/${token}`);
  try {
    await deps.sender.send(user.email, mail.subject, mail.html);
  } catch (e) {
    console.warn(`No se pudo enviar el correo de reset a ${user.email}:`, e);
  }
}

export async function resetPassword(deps: AuthDeps, raw: string, newPassword: string): Promise<boolean> {
  if (newPassword.length < 6) throw new AuthError('Mínimo 6 caracteres.');
  const t = await deps.tokens.consume(raw, 'RESET');
  if (!t) return false;
  await deps.users.update(t.userId, {
    passwordHash: await deps.hashPassword(newPassword),
    confirmed: true, // si puede leer su correo, la cuenta queda confirmada
  });
  // Si alguien tenía la sesión robada, la nueva contraseña lo saca de la cancha.
  await deps.revokeSessions(t.userId);
  return true;
}

export async function requestEmailChange(deps: AuthDeps, userId: string, newEmail: string): Promise<void> {
  const email = normalizeEmail(newEmail);
  const dueño = await deps.users.findById(userId);
  if (!dueño) throw new AuthError('Usuario no encontrado.');
  if (dueño.email === email) return; // sin cambios
  if (await deps.users.findByEmail(email)) {
    throw new AuthError('Ese correo ya lo usa otro jugador.');
  }
  const token = await deps.tokens.issue(userId, 'EMAIL_CHANGE', email);
  const mail = changeEmailEmail(`${deps.appUrl}/confirmar-email/${token}`);
  try {
    await deps.sender.send(email, mail.subject, mail.html);
  } catch {
    // Sin el correo el cambio no puede confirmarse: avisa en el formulario.
    throw new AuthError('No pudimos enviar el correo de confirmación a esa dirección.');
  }
}

export async function confirmEmailChange(deps: AuthDeps, raw: string): Promise<boolean> {
  const t = await deps.tokens.consume(raw, 'EMAIL_CHANGE');
  if (!t || !t.newEmail) return false;
  if (await deps.users.findByEmail(t.newEmail)) return false; // se ocupó mientras tanto
  await deps.users.update(t.userId, { email: t.newEmail });
  return true;
}
