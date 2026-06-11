import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { env } from '@/server/env';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import { getResultsProvider, prismaSyncRepo, runSync } from '@/server/services/sync';

export const dynamic = 'force-dynamic';

// Lo dispara la GitHub Action (Bearer SYNC_SECRET) o un admin con sesión.
export async function POST(req: Request): Promise<NextResponse> {
  const header = req.headers.get('authorization');
  let authorized = Boolean(env.syncSecret && header === `Bearer ${env.syncSecret}`);
  if (!authorized) {
    const user = await getSessionUser();
    authorized = Boolean(user && isAdmin(user.email));
  }
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const provider = getResultsProvider();
  if (!provider) {
    return NextResponse.json({ error: 'FOOTBALL_DATA_TOKEN no configurado' }, { status: 503 });
  }

  try {
    const summary = await runSync(prismaSyncRepo(db), await provider.fetchFinished());
    revalidatePath('/partidos');
    revalidatePath('/tabla');
    revalidatePath('/resultados');
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error de sincronización' },
      { status: 502 },
    );
  }
}
