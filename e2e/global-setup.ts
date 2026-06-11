import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  E2E_ADMIN_EMAIL,
  E2E_DB_URL,
  E2E_PASSWORD,
  E2E_UNCONFIRMED_EMAIL,
  E2E_USER_EMAIL,
} from './env';

// Deja la BD en un estado conocido: seed intacto, sin usuarios/picks/resultados,
// llaves KO sin asignar, y el partido 72 ya iniciado (para los sad paths de cierre).
export default async function globalSetup() {
  const db = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } });
  try {
    await db.pick.deleteMany({});
    await db.session.deleteMany({});
    await db.emailToken.deleteMany({});
    await db.user.deleteMany({});
    await db.match.updateMany({ data: { homeGoals: null, awayGoals: null, penWinner: null } });
    await db.match.updateMany({ where: { isKnockout: true }, data: { homeCode: null, awayCode: null } });
    await db.match.update({ where: { id: 72 }, data: { kickoffUtc: new Date(Date.now() - 3_600_000) } });

    const passwordHash = await bcrypt.hash(E2E_PASSWORD, 12);
    await db.user.createMany({
      data: [
        { id: 'e2e-user', nombre: 'Erik', apellido: 'Prueba', email: E2E_USER_EMAIL, passwordHash, color: '#5aa9e6', confirmed: true },
        { id: 'e2e-admin', nombre: 'Adriana', apellido: 'Admin', email: E2E_ADMIN_EMAIL, passwordHash, color: '#e0a83c', confirmed: true },
        { id: 'e2e-noconf', nombre: 'Nora', apellido: 'Pendiente', email: E2E_UNCONFIRMED_EMAIL, passwordHash, color: '#e26d5c', confirmed: false },
      ],
    });
  } finally {
    await db.$disconnect();
  }
}
