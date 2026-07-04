// scripts/rollback-premature-results.ts
// One-off OPERATIVO: revierte los daños de marcadores capturados en partidos
// que aún NO se juegan (bug: saveResult no validaba el kickoff) y del
// auto-avance que propagó equipos fantasma hacia R16+.
//
//   1. Detecta "prematuros": partidos KO con resultado pero kickoffUtc > now.
//      A esos se les vacía el marcador.
//   2. Recalcula el avance esperado con computeAdvancement tratando a los
//      prematuros como sin resultado, y compara contra los lados hoy poblados
//      en R16/QF/SF/FIN y el 3.er lugar: todo lado que no coincida con lo
//      esperado se vacía (y se borran los picks de esa llave, ya que apuntaban
//      a equipos fantasma).
//
// Seguro por defecto: DRY-RUN; escribe solo con --apply.
//
// Uso: pnpm exec tsx --env-file=.env scripts/rollback-premature-results.ts [--apply]
import { db } from '../src/server/db';
import { computeAdvancement, THIRD_PLACE_ID, type AdvanceInput } from '../src/domain/bracket-topology';

const APPLY = process.argv.includes('--apply');
const ETAPAS_DERIVADAS = ['R16', 'QF', 'SF', 'FIN'] as const;

interface LadosEsperados { H?: string; A?: string }

async function main() {
  const now = new Date();
  console.log('Ahora UTC:', now.toISOString());
  console.log(APPLY ? 'Modo: APPLY (se escribirá en la BD)\n' : 'Modo: DRY-RUN (nada se escribe)\n');

  const matches = await db.match.findMany({
    where: { isKnockout: true },
    select: {
      id: true, stage: true, tag: true, isKnockout: true,
      homeCode: true, awayCode: true,
      homeGoals: true, awayGoals: true, penWinner: true, kickoffUtc: true,
      _count: { select: { picks: true } },
    },
    orderBy: { id: 'asc' },
  });

  // (a) Prematuros: tienen marcador pero el partido aún no inicia.
  const prematuros = matches.filter((m) => m.homeGoals !== null && m.kickoffUtc.getTime() > now.getTime());
  const idsPrematuros = new Set(prematuros.map((m) => m.id));

  console.log(`Prematuros (marcador antes del kickoff): ${prematuros.length}`);
  for (const m of prematuros) {
    const pen = m.penWinner ? ` pen:${m.penWinner}` : '';
    console.log(`  #${m.id} [${m.stage}] ${m.homeCode}-${m.awayCode}  ${m.homeGoals}-${m.awayGoals}${pen}  kickoff ${m.kickoffUtc.toISOString()}`);
  }

  // (b) Avance esperado con los prematuros tratados como SIN resultado.
  const inputs: AdvanceInput[] = matches.map((m) => ({
    id: m.id,
    stage: m.stage,
    isKnockout: m.isKnockout,
    homeCode: m.homeCode,
    awayCode: m.awayCode,
    result:
      idsPrematuros.has(m.id) || m.homeGoals === null || m.awayGoals === null
        ? null
        : { homeGoals: m.homeGoals, awayGoals: m.awayGoals, penWinner: m.penWinner },
  }));
  const { writes, anomalies } = computeAdvancement(inputs);

  const esperado = new Map<number, LadosEsperados>();
  for (const w of writes) {
    const lados = esperado.get(w.matchId) ?? {};
    lados[w.slot] = w.teamCode;
    esperado.set(w.matchId, lados);
  }

  // (c) Llaves derivadas (R16+ y 3.er lugar) con lados poblados que NO
  //     coinciden con lo esperado → vaciar el lado (avance fantasma).
  const esDerivada = (m: (typeof matches)[number]) =>
    (ETAPAS_DERIVADAS as readonly string[]).includes(m.stage) || m.id === THIRD_PLACE_ID;

  const aVaciar = matches
    .filter(esDerivada)
    .map((m) => {
      const lados = esperado.get(m.id) ?? {};
      const vaciarH = m.homeCode !== null && m.homeCode !== lados.H;
      const vaciarA = m.awayCode !== null && m.awayCode !== lados.A;
      return { m, vaciarH, vaciarA };
    })
    .filter(({ vaciarH, vaciarA }) => vaciarH || vaciarA);

  // (d) Plan completo.
  console.log(`\nLlaves R16+/3.º con lados fantasma a vaciar: ${aVaciar.length}`);
  for (const { m, vaciarH, vaciarA } of aVaciar) {
    const partes = [
      vaciarH ? `H:${m.homeCode}→null` : null,
      vaciarA ? `A:${m.awayCode}→null` : null,
      m.homeGoals !== null ? `marcador ${m.homeGoals}-${m.awayGoals}→null` : null,
      m._count.picks > 0 ? `picks a borrar: ${m._count.picks}` : null,
    ].filter(Boolean);
    console.log(`  #${m.id} [${m.stage}] ${m.tag ?? ''}  ${partes.join(' · ')}`);
  }

  if (anomalies.length) {
    console.log(`\nAnomalías de topología (${anomalies.length}):`);
    for (const a of anomalies) console.log(`  - ${a}`);
  }

  const totalPicks = aVaciar.reduce((acc, { m }) => acc + m._count.picks, 0);
  console.log(`\nResumen: ${prematuros.length} marcador(es) a vaciar · ${aVaciar.length} llave(s) a limpiar · ${totalPicks} pick(s) a borrar.`);

  if (!APPLY) {
    console.log('\nDRY-RUN: nada escrito. Corre con --apply para aplicar.');
    return;
  }

  // (e) Escritura: primero los marcadores prematuros, luego las llaves fantasma.
  for (const m of prematuros) {
    await db.match.update({
      where: { id: m.id },
      data: { homeGoals: null, awayGoals: null, penWinner: null },
    });
  }
  for (const { m, vaciarH, vaciarA } of aVaciar) {
    await db.pick.deleteMany({ where: { matchId: m.id } });
    await db.match.update({
      where: { id: m.id },
      data: {
        ...(vaciarH ? { homeCode: null } : {}),
        ...(vaciarA ? { awayCode: null } : {}),
        homeGoals: null,
        awayGoals: null,
        penWinner: null,
      },
    });
  }
  console.log(`\n✓ Aplicado: ${prematuros.length} marcador(es) vaciado(s), ${aVaciar.length} llave(s) limpiada(s), ${totalPicks} pick(s) borrado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
