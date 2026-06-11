import { notFound, redirect } from 'next/navigation';
import { PlayersScreen } from '@/components/admin/PlayersScreen';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import { getAllPlayers } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function JugadoresPage() {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  if (!isAdmin(me)) notFound();

  const players = await getAllPlayers();
  return <PlayersScreen players={players} meId={me.id} />;
}
