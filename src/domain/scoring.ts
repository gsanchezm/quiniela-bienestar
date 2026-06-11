import type { MatchResult, Outcome, PickScore, PickValue } from './types';

// Resultado 1X2 de un partido terminado. En eliminatoria un empate se decide
// por penales; si aún no se captura el ganador, no hay resultado (null).
export function matchOutcome(r: MatchResult, isKnockout: boolean): Outcome | null {
  if (r.homeGoals > r.awayGoals) return 'H';
  if (r.homeGoals < r.awayGoals) return 'A';
  return isKnockout ? r.penWinner : 'D';
}

// Resultado 1X2 que implica un pronóstico de marcador. En eliminatoria un
// empate no implica ganador (lo deciden los penales).
export function impliedOutcome(predHome: number, predAway: number, isKnockout: boolean): Outcome | null {
  if (predHome > predAway) return 'H';
  if (predHome < predAway) return 'A';
  return isKnockout ? null : 'D';
}

// Puntos de un pick: 1 por acertar el 1X2, +2 por marcador exacto.
// El marcador exacto compara contra el marcador del juego (en KO con penales,
// el de los 120 minutos), independiente del ganador de la tanda.
export function scorePick(pick: PickValue, r: MatchResult, isKnockout: boolean): PickScore {
  const out = matchOutcome(r, isKnockout);
  const outcomeHit = pick.outcome !== null && out !== null && pick.outcome === out;
  const exactHit =
    pick.predHome !== null &&
    pick.predAway !== null &&
    pick.predHome === r.homeGoals &&
    pick.predAway === r.awayGoals;
  return { points: (outcomeHit ? 1 : 0) + (exactHit ? 2 : 0), outcomeHit, exactHit };
}
