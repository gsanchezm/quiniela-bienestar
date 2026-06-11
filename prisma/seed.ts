// Seed idempotente: crea las 48 selecciones y los 104 partidos del Mundial 2026.
// No toca resultados ni equipos de llaves ya asignados (update vacío en Match).
import { PrismaClient } from '@prisma/client';
import { TEAMS, MATCHES } from '../src/data/worldcup2026';

const prisma = new PrismaClient();

async function main() {
  for (const [code, t] of Object.entries(TEAMS)) {
    await prisma.team.upsert({
      where: { code },
      update: { name: t.name, flag: t.flag, group: t.group },
      create: { code, name: t.name, flag: t.flag, group: t.group },
    });
  }

  for (const m of MATCHES) {
    await prisma.match.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        stage: m.stage,
        group: m.group,
        tag: m.tag,
        isKnockout: m.isKnockout,
        homeCode: m.homeCode,
        awayCode: m.awayCode,
        kickoffUtc: new Date(m.kickoffUtc),
      },
    });
  }

  const teams = await prisma.team.count();
  const matches = await prisma.match.count();
  console.log(`Seed listo: ${teams} selecciones, ${matches} partidos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
