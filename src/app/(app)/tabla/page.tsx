import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { getSessionUser } from '@/server/auth/session';
import { getStandingsView } from '@/server/queries';

export const dynamic = 'force-dynamic';

const MEDALS = ['🥇', '🥈', '🥉'];

export default async function TablaPage() {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  const rows = await getStandingsView();
  const finished = rows[0]?.jugados ?? 0;

  return (
    <div className="screen">
      <div className="stagehead">
        <h2 className="stagetitle">Tabla de posiciones</h2>
        <div className="stageprogress">
          <span className="led led-sm">{finished < 10 ? '0' + finished : finished}</span>
          <span className="stageprogress-label">PARTIDOS JUGADOS</span>
        </div>
      </div>

      {finished === 0 && (
        <div className="notice">
          Aún no hay resultados — los puntos aparecerán cuando termine el primer partido.
          <br />
          Cada acierto de <strong>gana / empata / gana</strong> vale <strong>1 punto</strong> y el{' '}
          <strong>marcador exacto</strong> suma <strong>2 más</strong>.
        </div>
      )}

      <div className="standings">
        <div className="standings-headrow">
          <span>#</span>
          <span>Jugador</span>
          <span className="ta-r">Aciertos</span>
          <span className="ta-r">Puntos</span>
        </div>
        {rows.map((r, i) => (
          <Link
            key={r.user.id}
            href={`/tabla/${r.user.id}`}
            className={
              'standrow' +
              (r.user.id === me.id ? ' standrow-me' : '') +
              (i < 3 && finished > 0 ? ' standrow-top' + (i + 1) : '')
            }
          >
            <span className="standrow-rank">{finished > 0 && i < 3 ? MEDALS[i] : i + 1}</span>
            <span className="standrow-player">
              <Avatar user={r.user} size={34} />
              <span className="standrow-name">
                {r.user.nombre} {r.user.apellido}
                {r.user.id === me.id ? <em> (tú)</em> : null}
                <small>
                  {r.totalPicks} picks registrados
                  {r.exactos > 0 ? ` · ${r.exactos} exacto${r.exactos === 1 ? '' : 's'}` : ''}
                </small>
              </span>
            </span>
            <span className="standrow-hits ta-r">
              {r.aciertos}
              <small>/{r.jugados}</small>
            </span>
            <span className="standrow-pts ta-r led">{r.points < 10 ? '0' + r.points : r.points}</span>
          </Link>
        ))}
      </div>
      <p className="privnote">Toca a cualquier jugador para ver sus picks partido por partido.</p>
    </div>
  );
}
