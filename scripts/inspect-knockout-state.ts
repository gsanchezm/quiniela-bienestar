// scripts/inspect-knockout-state.ts
// READ-ONLY: reporta el estado de las llaves KO (equipos, resultados, #picks) por ronda.
// Uso: pnpm exec tsx --env-file=.env scripts/inspect-knockout-state.ts
import { db } from '../src/server/db';

async function main() {
  const rows = await db.match.findMany({
    where: { isKnockout: true },
    select: {
      id: true, stage: true, tag: true, homeCode: true, awayCode: true,
      homeGoals: true, awayGoals: true, penWinner: true, kickoffUtc: true,
      _count: { select: { picks: true } },
    },
    orderBy: { id: 'asc' },
  });
  for (const m of rows) {
    const teams = m.homeCode && m.awayCode ? `${m.homeCode}-${m.awayCode}` : '(vacío)';
    const res = m.homeGoals !== null ? `${m.homeGoals}-${m.awayGoals}${m.penWinner ? ' pen:' + m.penWinner : ''}` : '—';
    console.log(`#${m.id} [${m.stage}] ${teams.padEnd(10)} res:${res.padEnd(8)} picks:${m._count.picks}  ${m.kickoffUtc.toISOString()}`);
  }
  const r16plus = rows.filter((m) => ['R16', 'QF', 'SF', 'FIN'].includes(m.stage));
  const poblados = r16plus.filter((m) => m.homeCode || m.awayCode);
  const conPicks = r16plus.filter((m) => m._count.picks > 0);
  console.log(`\nR16+: ${r16plus.length} llaves · ${poblados.length} con equipos · ${conPicks.length} con picks`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
