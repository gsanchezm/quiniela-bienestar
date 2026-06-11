import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import { matchOutcome, scorePick } from '@/domain/scoring';

export const dynamic = 'force-dynamic';

// Respaldo para el admin: todos los jugadores con sus picks en CSV
// (con BOM, para que Excel lo abra con acentos correctos).
const HEADER = [
  'Jugador',
  'Email',
  'Confirmado',
  'Partido',
  'Etapa',
  'Local',
  'Visita',
  'KickoffUTC',
  'Pick',
  'PredLocal',
  'PredVisita',
  'GolesLocal',
  'GolesVisita',
  'Penales',
  'Puntos',
];

const esc = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(): Promise<NextResponse> {
  const me = await getSessionUser();
  if (!me || !isAdmin(me)) {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  const [users, matches, picks] = await Promise.all([
    db.user.findMany({
      select: { id: true, nombre: true, apellido: true, email: true, confirmed: true },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
    }),
    db.match.findMany({
      include: { home: { select: { name: true } }, away: { select: { name: true } } },
      orderBy: { id: 'asc' },
    }),
    db.pick.findMany({
      select: { userId: true, matchId: true, outcome: true, predHome: true, predAway: true },
    }),
  ]);

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const picksByUser = new Map<string, typeof picks>();
  for (const p of picks) {
    const list = picksByUser.get(p.userId) ?? [];
    list.push(p);
    picksByUser.set(p.userId, list);
  }

  const rows: string[] = [HEADER.join(',')];
  for (const u of users) {
    const base = [esc(`${u.nombre} ${u.apellido}`), esc(u.email), u.confirmed ? 'SI' : 'NO'];
    const userPicks = (picksByUser.get(u.id) ?? []).sort((a, b) => a.matchId - b.matchId);
    if (userPicks.length === 0) {
      rows.push([...base, '', '', '', '', '', '', '', '', '', '', '', ''].join(','));
      continue;
    }
    for (const p of userPicks) {
      const m = matchById.get(p.matchId)!;
      const result =
        m.homeGoals !== null && m.awayGoals !== null
          ? { homeGoals: m.homeGoals, awayGoals: m.awayGoals, penWinner: m.penWinner }
          : null;
      const points =
        result && matchOutcome(result, m.isKnockout) !== null
          ? scorePick(
              { outcome: p.outcome, predHome: p.predHome, predAway: p.predAway },
              result,
              m.isKnockout,
            ).points
          : '';
      rows.push(
        [
          ...base,
          m.id,
          esc(m.stage),
          esc(m.home?.name ?? m.tag ?? ''),
          esc(m.away?.name ?? ''),
          m.kickoffUtc.toISOString(),
          p.outcome ?? '',
          p.predHome ?? '',
          p.predAway ?? '',
          m.homeGoals ?? '',
          m.awayGoals ?? '',
          m.penWinner ?? '',
          points,
        ].join(','),
      );
    }
  }

  const csv = '﻿' + rows.join('\r\n');
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="quiniela-respaldo-${fecha}.csv"`,
    },
  });
}
