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

    // Kickoffs relativos a "ahora": la suite no debe romperse conforme el
    // torneo real avanza y las fechas del seed quedan en el pasado.
    // Además fijamos la "fase actual" de forma DETERMINISTA en J1 (de la que
    // dependen casi todas las pruebas): primero mandamos TODOS los kickoffs al
    // pasado y luego adelantamos solo los partidos que las pruebas usan,
    // dejando el partido 7 (J1, sin asserts propios) como el más próximo para
    // que /partidos y /resultados siempre aterricen en J1.
    const HORA = 3_600_000;
    await db.match.updateMany({ data: { kickoffUtc: new Date('2020-01-01T00:00:00Z') } });
    const abiertos = [1, 2, 3, 4, 5, 6, 73]; // los que las pruebas usan como editables
    for (const id of abiertos) {
      await db.match.update({ where: { id }, data: { kickoffUtc: new Date(Date.now() + 72 * HORA) } });
    }
    await db.match.update({ where: { id: 7 }, data: { kickoffUtc: new Date(Date.now() + 1 * HORA) } }); // ancla: J1 = fase actual
    await db.match.update({ where: { id: 71 }, data: { kickoffUtc: new Date(Date.now() + 2 * HORA) } }); // cierra pronto
    await db.match.update({ where: { id: 72 }, data: { kickoffUtc: new Date(Date.now() - 1 * HORA) } }); // ya iniciado

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
