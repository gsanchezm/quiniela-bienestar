// Smoke de integración contra un Postgres real (prisma dev / Render).
// Ejercita el flujo completo a nivel servicios: registro → confirmación →
// login → picks + marcador → cierre → resultado admin → puntos → privacidad.
// Uso: DATABASE_URL=... pnpm exec tsx scripts/smoke.ts
import { db } from '../src/server/db';
import { signup, confirmAccount, login } from '../src/server/services/auth';
import { realAuthDeps } from '../src/server/services/auth-deps';
import { PickError, prismaPicksRepo, setOutcome, setScorePrediction } from '../src/server/services/picks';
import { prismaResultsRepo, saveResult } from '../src/server/services/results';
import { getMatchesForUser, getPlayerPicksView, getStandingsView } from '../src/server/queries';

let fallas = 0;
function check(nombre: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) fallas += 1;
}

async function main() {
  // estado limpio (solo datos de usuarios; los partidos del seed se quedan)
  await db.pick.deleteMany({});
  await db.session.deleteMany({});
  await db.emailToken.deleteMany({});
  await db.user.deleteMany({});
  await db.match.update({ where: { id: 1 }, data: { homeGoals: null, awayGoals: null, penWinner: null } });

  check('seed: 48 equipos y 104 partidos', (await db.team.count()) === 48 && (await db.match.count()) === 104);

  // — registro/confirmación/login (capturando el correo en memoria) —
  const deps = realAuthDeps();
  let ultimoHtml = '';
  deps.sender = {
    async send(_to: string, _subject: string, html: string) {
      ultimoHtml = html;
    },
  };
  const user = await signup(deps, {
    nombre: 'Gil',
    apellido: 'Sánchez',
    email: 'gilberto.aspros@gmail.com',
    password: 'secreto1',
  });
  check('registro crea la cuenta sin confirmar', !user.confirmed);

  const token = ultimoHtml.match(/confirmar\/([0-9a-f]{64})/)?.[1];
  check('el correo trae enlace de confirmación', Boolean(token));
  const uid = await confirmAccount(deps, token!);
  check('confirmar con el token funciona y es de un solo uso', uid === user.id && (await confirmAccount(deps, token!)) === null);
  const logged = await login(deps, 'GILBERTO.ASPROS@gmail.com ', 'secreto1');
  check('login tras confirmar (correo normalizado)', logged.id === user.id);

  // — picks contra la BD real —
  const repo = prismaPicksRepo(db);
  const antesDelKickoff = new Date('2026-06-11T18:00:00Z');
  await setOutcome(repo, user.id, 1, 'H', antesDelKickoff);
  await setScorePrediction(repo, user.id, 1, 2, 0, antesDelKickoff);
  const pick = await db.pick.findUnique({ where: { userId_matchId: { userId: user.id, matchId: 1 } } });
  check('pick H con marcador 2-0 guardado', pick?.outcome === 'H' && pick?.predHome === 2 && pick?.predAway === 0);

  let rechazado = false;
  try {
    await setOutcome(repo, user.id, 1, 'A', new Date('2026-06-11T19:00:00Z'));
  } catch (e) {
    rechazado = e instanceof PickError;
  }
  check('el servidor rechaza picks desde el silbatazo', rechazado);

  // — resultado oficial (admin) y puntos —
  await saveResult(prismaResultsRepo(db), 1, { homeGoals: 2, awayGoals: 0, penWinner: null });
  const tabla = await getStandingsView();
  const fila = tabla.find((r) => r.user.id === user.id);
  check('tabla: 3 puntos = 1 acierto + marcador exacto', fila?.points === 3 && fila?.aciertos === 1 && fila?.exactos === 1);

  const vistaPartidos = await getMatchesForUser(user.id);
  const m1 = vistaPartidos.find((m) => m.id === 1);
  check('vista de partidos trae mi puntaje del partido final', m1?.myScore?.points === 3 && m1?.outcome === 'H');

  // — privacidad: picks ajenos ocultos hasta el cierre —
  const otra = await db.user.create({
    data: { nombre: 'Ana', apellido: 'Torres', email: 'ana@demo.mx', passwordHash: 'x', color: '#5aa9e6', confirmed: true },
  });
  await setOutcome(repo, otra.id, 2, 'H', antesDelKickoff);
  const vistaAjena = await getPlayerPicksView(otra.id, user.id);
  const fila2 = vistaAjena?.rows.find((r) => r.match.id === 2);
  check('pick ajeno de partido abierto llega oculto y sin datos', fila2?.hidden === true && fila2?.match.myPick === null);
  const vistaPropia = await getPlayerPicksView(otra.id, otra.id);
  check('el dueño sí ve su propio pick', vistaPropia?.rows.find((r) => r.match.id === 2)?.hidden === false);

  console.log(fallas === 0 ? '\nSmoke OK — todos los checks pasaron.' : `\nSmoke con ${fallas} falla(s).`);
  process.exitCode = fallas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
