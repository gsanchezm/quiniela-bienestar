import { scorePick } from './scoring';
import type { MatchResult, PickValue } from './types';

export interface StandingsUser {
  id: string;
  nombre: string;
  apellido: string;
}

export interface FinishedMatch {
  id: number;
  isKnockout: boolean;
  result: MatchResult;
}

/** { userId: { matchId: PickValue } } */
export type PicksByUser = Record<string, Record<number, PickValue>>;

export interface StandingRow {
  userId: string;
  points: number;
  aciertos: number; // picks 1X2 correctos
  exactos: number; // marcadores exactos
  jugados: number; // partidos terminados (global)
  totalPicks: number; // picks registrados por el usuario
}

// Tabla: puntos desc → aciertos 1X2 desc → alfabético (es). Función pura.
export function computeStandings(
  users: StandingsUser[],
  finished: FinishedMatch[],
  picks: PicksByUser,
): StandingRow[] {
  const nameOf = new Map(users.map((u) => [u.id, `${u.nombre} ${u.apellido}`]));

  return users
    .map((u) => {
      const userPicks = picks[u.id] ?? {};
      let points = 0;
      let aciertos = 0;
      let exactos = 0;
      for (const m of finished) {
        const pick = userPicks[m.id];
        if (!pick) continue;
        const s = scorePick(pick, m.result, m.isKnockout);
        points += s.points;
        if (s.outcomeHit) aciertos += 1;
        if (s.exactHit) exactos += 1;
      }
      return {
        userId: u.id,
        points,
        aciertos,
        exactos,
        jugados: finished.length,
        totalPicks: Object.keys(userPicks).length,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.aciertos - a.aciertos ||
        nameOf.get(a.userId)!.localeCompare(nameOf.get(b.userId)!, 'es'),
    );
}
