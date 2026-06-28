// One-off OPERATIVO (break-glass): llena las llaves de eliminatoria vacías con
// los cruces de football-data (o --from-json) de un jalón. Seguro por defecto:
// DRY-RUN; escribe solo con --apply. La ruta normal es AUTOMÁTICA (sync de 15
// min); esto es por si hay que forzarlo a mano.
//
// Uso:
//   DATABASE_URL=... FOOTBALL_DATA_TOKEN=... pnpm exec tsx --env-file=.env scripts/assign-knockout.ts
//   ... --apply
//   ... --from-json cruces.json   ([{ "stage":"LAST_16","home":"ESP","away":"URU","kickoffUtc":"2026-07-04T18:00:00Z" }, ...])
import { readFileSync } from 'node:fs';
import { db } from '../src/server/db';
import {
  planKnockoutAssignments,
  mapFdStage,
  stageHistogram,
  type Llave,
  type ProviderFixture,
} from '../src/domain/knockout-assign';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const valueOf = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = has('--apply');
const fromJson = valueOf('--from-json');

async function getFixtures(): Promise<ProviderFixture[]> {
  if (fromJson) {
    const raw = JSON.parse(readFileSync(fromJson, 'utf8')) as Array<{
      stage: string;
      home: string;
      away: string;
      kickoffUtc: string;
    }>;
    return raw.map((r) => ({
      utcDate: r.kickoffUtc,
      stage: r.stage,
      homeTeam: { tla: r.home, name: r.home },
      awayTeam: { tla: r.away, name: r.away },
    }));
  }
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('Falta FOOTBALL_DATA_TOKEN (o usa --from-json <archivo>).');
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': token },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`football-data.org respondió ${res.status}`);
  const data = (await res.json()) as { matches?: Array<ProviderFixture & { stage: string }> };
  const all = data.matches ?? [];
  console.log('Fases reportadas por football-data:', stageHistogram(all));
  return all.filter((m) => mapFdStage(m.stage) !== null && m.homeTeam?.tla && m.awayTeam?.tla);
}

async function main() {
  const [teams, llaveRows] = await Promise.all([
    db.team.findMany({ select: { code: true, name: true } }),
    db.match.findMany({
      where: { isKnockout: true },
      select: { id: true, stage: true, tag: true, homeCode: true, awayCode: true, kickoffUtc: true },
    }),
  ]);
  const knownCodes = new Set(teams.map((t) => t.code));
  const nameOf = new Map(teams.map((t) => [t.code, t.name]));
  const llaves: Llave[] = llaveRows.map((r) => ({ ...r, stage: r.stage as string }));

  const fixtures = await getFixtures();
  console.log(`\nCruces KO con equipos: ${fixtures.length}  ·  llaves KO en BD: ${llaves.length}`);

  const plan = planKnockoutAssignments(fixtures, llaves, knownCodes, new Date());
  const label = (c: string) => `${nameOf.get(c) ?? '??'} (${c})`;
  console.log('\nPlan (llave → local vs visitante · kickoff UTC · estado):');
  for (const r of plan.rows) {
    console.log(`  #${r.matchId} [${r.stage}]  ${label(r.homeCode)}  vs  ${label(r.awayCode)}  ·  ${r.kickoffUtc.toISOString()}  ·  ${r.status}`);
  }
  if (plan.anomalies.length) {
    console.log('\n⚠️ Anomalías:');
    for (const a of plan.anomalies) console.log('   - ' + a);
  }

  const writable = plan.rows.filter((r) => r.status === 'assign');
  if (!APPLY) {
    console.log(`\nDRY-RUN: se escribirían ${writable.length} llave(s). Corre con --apply para aplicar.`);
    return;
  }
  let written = 0;
  for (const r of writable) {
    await db.match.update({
      where: { id: r.matchId },
      data: { homeCode: r.homeCode, awayCode: r.awayCode, kickoffUtc: r.kickoffUtc },
    });
    written += 1;
  }
  console.log(`\n✓ Aplicado: ${written} llave(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
