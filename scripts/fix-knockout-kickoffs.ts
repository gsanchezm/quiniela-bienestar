// One-off OPERATIVO: corrige las horas de kickoff de los partidos de
// eliminatoria que YA tienen equipos, poniéndolas a la hora REAL de
// football-data. Las horas sembradas eran estimaciones más tempranas que las
// reales, así que la app cerraba los picks antes de tiempo. Solo cambia la
// hora; NO toca equipos, resultados ni picks. Seguro por defecto: DRY-RUN;
// escribe solo con --apply.
//
// Uso:
//   pnpm exec tsx --env-file=.env scripts/fix-knockout-kickoffs.ts            # preview
//   pnpm exec tsx --env-file=.env scripts/fix-knockout-kickoffs.ts --apply    # aplica
import { db } from '../src/server/db';
import { getResultsProvider } from '../src/server/services/sync';

const APPLY = process.argv.includes('--apply');

async function main() {
  const now = Date.now();
  console.log('Ahora UTC:', new Date(now).toISOString());

  const matches = await db.match.findMany({
    where: { isKnockout: true, homeCode: { not: null }, awayCode: { not: null } },
    select: { id: true, stage: true, homeCode: true, awayCode: true, kickoffUtc: true },
    orderBy: { id: 'asc' },
  });

  const provider = getResultsProvider();
  if (!provider) throw new Error('Falta FOOTBALL_DATA_TOKEN (pásalo en .env).');
  const all = await provider.fetchAll();
  const realByPair = new Map(
    all
      .filter((m) => m.homeTeam?.tla && m.awayTeam?.tla)
      .map((m) => [`${m.homeTeam.tla}/${m.awayTeam.tla}`, m.utcDate]),
  );

  const updates: Array<{ id: number; stage: string; pair: string; from: string; to: string; reopen: boolean }> = [];
  for (const m of matches) {
    const real = realByPair.get(`${m.homeCode}/${m.awayCode}`);
    if (!real) {
      console.log(`#${m.id} ${m.homeCode}-${m.awayCode}: sin coincidencia en football-data, se omite.`);
      continue;
    }
    const fromMs = m.kickoffUtc.getTime();
    const toMs = Date.parse(real);
    if (toMs === fromMs) continue; // ya está correcta
    updates.push({
      id: m.id,
      stage: m.stage as string,
      pair: `${m.homeCode}-${m.awayCode}`,
      from: m.kickoffUtc.toISOString(),
      to: real,
      reopen: now >= fromMs && now < toMs, // estaba cerrada por hora sembrada, la real aún no llega
    });
  }

  console.log(`\nHoras a corregir: ${updates.length}`);
  for (const u of updates) {
    console.log(`  #${u.id} [${u.stage}] ${u.pair}  ${u.from}  ->  ${u.to}${u.reopen ? '   <== RE-ABRE picks' : ''}`);
  }
  const reopens = updates.filter((u) => u.reopen).length;
  if (reopens) console.log(`\n${reopens} partido(s) se RE-ABREN (estaban cerrados antes de tiempo).`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nada escrito. Corre con --apply para aplicar.');
    return;
  }
  for (const u of updates) {
    await db.match.update({ where: { id: u.id }, data: { kickoffUtc: new Date(u.to) } });
  }
  console.log(`\n✓ Aplicado: ${updates.length} hora(s) corregida(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
