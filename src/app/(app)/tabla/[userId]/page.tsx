import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { currentStage } from '@/domain/stages';
import { getSessionUser } from '@/server/auth/session';
import { getPlayerPicksView } from '@/server/queries';
import { PlayerPicksTable } from './PlayerPicksTable';

export const dynamic = 'force-dynamic';

export default async function JugadorPage({ params }: { params: Promise<{ userId: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  const { userId } = await params;
  const view = await getPlayerPicksView(userId, me.id);
  if (!view) notFound();
  const isMe = view.owner.id === me.id;
  const initialStage = currentStage(
    view.rows.map((r) => r.match),
    Date.now(),
  );

  return (
    <div className="screen">
      <Link className="linklike authback" href="/tabla">
        ← Tabla de posiciones
      </Link>
      <div className="player-head">
        <Avatar user={view.owner} size={64} />
        <div>
          <h2 className="player-name">
            {view.owner.nombre} {view.owner.apellido}
            {isMe ? ' (tú)' : ''}
          </h2>
          <span className="player-sub">Participante</span>
        </div>
      </div>
      <PlayerPicksTable rows={view.rows} initialStage={initialStage} />
    </div>
  );
}
