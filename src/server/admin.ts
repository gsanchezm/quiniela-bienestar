import { env } from './env';

// Dos niveles: super-admins (ADMIN_EMAILS, imborrables e indegradables) y
// admins nombrados desde la UI (columna isAdmin). Mismos poderes operativos.

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminEmails.includes(email.trim().toLowerCase());
}

export function isAdmin(user: { email: string; isAdmin?: boolean } | null | undefined): boolean {
  if (!user) return false;
  return user.isAdmin === true || isSuperAdmin(user.email);
}
