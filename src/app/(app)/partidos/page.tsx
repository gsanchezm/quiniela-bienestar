import { redirect } from 'next/navigation';
import { MatchesScreen } from '@/components/matches/MatchesScreen';
import { getSessionUser } from '@/server/auth/session';
import { getMatchesForUser } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function PartidosPage() {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  const matches = await getMatchesForUser(me.id);
  return <MatchesScreen matches={matches} />;
}
