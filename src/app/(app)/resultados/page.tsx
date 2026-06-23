import { notFound, redirect } from 'next/navigation';
import { AdminScreen } from '@/components/admin/AdminScreen';
import { currentStage } from '@/domain/stages';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import { getMatchesForUser } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function ResultadosPage() {
  const me = await getSessionUser();
  if (!me) redirect('/login');
  if (!isAdmin(me)) notFound(); // la pantalla no existe para no-admins

  const [matches, teams] = await Promise.all([
    getMatchesForUser(me.id),
    db.team.findMany({
      select: { code: true, name: true, flag: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const initialStage = currentStage(matches, Date.now());
  return (
    <AdminScreen
      matches={matches}
      teams={teams}
      syncAvailable={Boolean(env.footballDataToken)}
      initialStage={initialStage}
    />
  );
}
