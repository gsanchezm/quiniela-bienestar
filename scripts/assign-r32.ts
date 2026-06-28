// One-off OPERATIVO: llena de un jalón las 16 llaves de dieciseisavos (R32) con
// los cruces reales de football-data.org (o una lista manual). Seguro por
// defecto: hace DRY-RUN (no escribe); solo aplica con --apply.
//
// Por qué existe: los partidos de eliminatoria se siembran sin equipos y nada
// automático los llena (el sync solo escribe marcadores de partidos que ya
// tienen equipos). Sin esto, los 16vos quedan en "Por definir" y nadie puede
// pickearlos. Ver `src/domain/r32-assign.ts`.
//
// Uso (corre PRIMERO sin --apply y revisa el plan):
//   DATABASE_URL=... FOOTBALL_DATA_TOKEN=... pnpm exec tsx scripts/assign-r32.ts
//   DATABASE_URL=... FOOTBALL_DATA_TOKEN=... pnpm exec tsx scripts/assign-r32.ts --apply
//   DATABASE_URL=... pnpm exec tsx scripts/assign-r32.ts --from-json cruces.json --apply
// Flags:
//   --apply         escribe en la BD (sin él: solo muestra el plan)
//   --stage CODE    fuerza el código de fase del proveedor (ej. LAST_32)
//   --from-json F   lee los cruces de un archivo [{ "home":"ESP","away":"URU","kickoffUtc":"2026-06-28T17:00:00Z" }, ...]
//   --force         sobreescribe llaves que ya tenían OTROS equipos (borra sus picks; spec §4.4)
//   --set-kickoff   ADEMÁS de los equipos, pisa la hora sembrada con la real del proveedor
//                   (cambia el cierre de picks; por defecto NO se toca — el sync de goles tolera ±36 h)
import { readFileSync } from 'node:fs';
import { db } from '../src/server/db';
import {
  planAssignments,
  selectR32Fixtures,
  stageHistogram,
  R32_STAGE_CANDIDATES,
  type ProviderFixture,
} from '../src/domain/r32-assign';

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = has('--apply');
const FORCE = has('--force');
const SET_KICKOFF = has('--set-kickoff');
const fromJson = valueOf('--from-json');
const stageOverride = valueOf('--stage');

async function getFixtures(): Promise<ProviderFixture[]> {
  if (fromJson) {
    const raw = JSON.parse(readFileSync(fromJson, 'utf8')) as Array<{
      home: string;
      away: string;
      kickoffUtc: string;
    }>;
    console.log(`Cruces leídos de ${fromJson}: ${raw.length}`);
    return raw.map((r) => ({
      utcDate: r.kickoffUtc,
      stage: stageOverride ?? 'LAST_32',
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
  if (res.status === 429) {
    throw new Error('football-data.org limita a 10 consultas/min en el plan gratuito — espera un minuto.');
  }
  if (!res.ok) throw new Error(`football-data.org respondió ${res.status}`);
  const data = (await res.json()) as { matches?: ProviderFixture[] };
  const all = data.matches ?? [];
  console.log('Fases reportadas por football-data:', stageHistogram(all));
  const stages = stageOverride ? [stageOverride] : [...R32_STAGE_CANDIDATES];
  return selectR32Fixtures(all, stages);
}

async function main() {
  const [teams, llaves] = await Promise.all([
    db.team.findMany({ select: { code: true, name: true } }),
    db.match.findMany({
      where: { stage: 'R32' },
      select: { id: true, homeCode: true, awayCode: true, kickoffUtc: true },
    }),
  ]);
  const knownCodes = new Set(teams.map((t) => t.code));
  const nameOf = new Map(teams.map((t) => [t.code, t.name]));

  const fixtures = await getFixtures();
  console.log(`\nCruces R32 con ambos equipos definidos: ${fixtures.length}  ·  llaves R32 en BD: ${llaves.length}`);
  if (fixtures.length === 0) {
    console.log('\nAún no hay cruces de 16vos con equipos definidos.');
    console.log('  → Si football-data ya tiene el sorteo, reintenta con --stage <CODIGO> (mira las fases de arriba).');
    console.log('  → O cárgalos a mano con --from-json archivo.json ([{home,away,kickoffUtc}, …]).');
    return;
  }

  const plan = planAssignments(fixtures, llaves, knownCodes, new Date(), { setKickoff: SET_KICKOFF });

  const label = (code: string) => `${nameOf.get(code) ?? '??'} (${code})`;
  console.log(
    SET_KICKOFF
      ? '\nPlan (llave → local vs visitante · kickoff que QUEDARÁ (real del proveedor) · estado):'
      : '\nPlan (llave → local vs visitante · kickoff sembrado [sin cambios] · estado):',
  );
  for (const r of plan.rows) {
    console.log(`  #${r.matchId}  ${label(r.homeCode)}  vs  ${label(r.awayCode)}  ·  ${r.kickoffUtc.toISOString()}  ·  ${r.status}`);
  }
  const counts = plan.rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\nResumen por estado:', counts);

  if (plan.errors.length) {
    console.log('\n⛔ Errores — NO se escribe nada hasta resolverlos:');
    for (const e of plan.errors) console.log('   - ' + e);
    process.exitCode = 1;
    return;
  }

  const writable = plan.rows.filter((r) => r.status === 'assign' || (FORCE && r.status === 'occupied'));
  const skippedOccupied = plan.rows.filter((r) => r.status === 'occupied').length;
  if (!FORCE && skippedOccupied > 0) {
    console.log(`\n⚠️  ${skippedOccupied} llave(s) ya tenían otros equipos y se OMITEN (usa --force para pisarlas; borra sus picks).`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN: se escribirían ${writable.length} llave(s). Revisa el plan y vuelve a correr con --apply.`);
    return;
  }

  let written = 0;
  for (const r of writable) {
    if (r.status === 'occupied') await db.pick.deleteMany({ where: { matchId: r.matchId } });
    await db.match.update({
      where: { id: r.matchId },
      // Solo equipos por defecto; la hora se respeta salvo --set-kickoff.
      data: SET_KICKOFF
        ? { homeCode: r.homeCode, awayCode: r.awayCode, kickoffUtc: r.kickoffUtc }
        : { homeCode: r.homeCode, awayCode: r.awayCode },
    });
    written += 1;
  }
  console.log(`\n✓ Aplicado: ${written} llave(s) ${SET_KICKOFF ? '(equipos + hora real)' : '(solo equipos; hora sin cambios)'}.`);
  if (counts.locked) console.log(`  (${counts.locked} ya iniciaron y se omitieron — sus picks ya estaban cerrados.)`);
  if (counts.unchanged) console.log(`  (${counts.unchanged} ya estaban correctas.)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
