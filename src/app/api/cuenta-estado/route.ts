import { NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Lo consulta la pantalla post-registro para detectar la activación en vivo.
// El id es un cuid no adivinable y solo se revela un booleano.
export async function GET(req: Request): Promise<NextResponse> {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  const user = await db.user.findUnique({ where: { id }, select: { confirmed: true } });
  return NextResponse.json({ confirmed: user?.confirmed ?? false });
}
