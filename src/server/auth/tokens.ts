import type { TokenType } from '@prisma/client';
import { db } from '@/server/db';
import { hashToken, newToken } from '@/server/crypto';

export const TOKEN_TTL_HOURS: Record<TokenType, number> = {
  CONFIRM: 24,
  RESET: 2,
  EMAIL_CHANGE: 24,
};

// Emite un token de un solo uso y regresa el valor crudo (va en el enlace).
export async function issueToken(userId: string, type: TokenType, newEmail?: string): Promise<string> {
  const raw = newToken();
  await db.emailToken.create({
    data: {
      token: hashToken(raw),
      type,
      userId,
      newEmail: newEmail ?? null,
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS[type] * 3_600_000),
    },
  });
  return raw;
}

// Consume (borra) el token; regresa sus datos si era válido y vigente.
export async function consumeToken(raw: string, type: TokenType) {
  const t = await db.emailToken.findUnique({ where: { token: hashToken(raw) } });
  if (!t || t.type !== type) return null;
  await db.emailToken.delete({ where: { token: t.token } });
  if (t.expiresAt < new Date()) return null;
  return t;
}
