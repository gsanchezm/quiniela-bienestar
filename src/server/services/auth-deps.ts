import { db } from '@/server/db';
import { issueToken, consumeToken } from '@/server/auth/tokens';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { getEmailSender } from '@/server/email/sender';
import { env } from '@/server/env';
import type { AuthDeps } from './auth';

// Cableado de producción del servicio de auth (los tests usan fakes).
export function realAuthDeps(): AuthDeps {
  return {
    users: {
      findByEmail: (email) => db.user.findUnique({ where: { email } }),
      findById: (id) => db.user.findUnique({ where: { id } }),
      create: (data) => db.user.create({ data }),
      update: async (id, data) => {
        await db.user.update({ where: { id }, data });
      },
    },
    tokens: {
      issue: (userId, type, newEmail) => issueToken(userId, type, newEmail),
      consume: async (raw, type) => {
        const t = await consumeToken(raw, type);
        return t ? { userId: t.userId, newEmail: t.newEmail } : null;
      },
    },
    sender: getEmailSender(),
    revokeSessions: async (userId) => {
      await db.session.deleteMany({ where: { userId } });
    },
    hashPassword,
    verifyPassword,
    appUrl: env.appUrl,
  };
}
