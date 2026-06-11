import { env } from './env';

// El rol de admin se deriva de ADMIN_EMAILS (sin columna en BD): la lista
// es chica y así no hay estado que sincronizar.
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.adminEmails.includes(email.trim().toLowerCase());
}
