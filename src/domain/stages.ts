import { STAGES, type StageId } from '@/data/worldcup2026';

interface StageItem {
  stage: string; // 'J1'..'FIN' — se acepta string para encajar con MatchView.stage
  kickoffUtc: string; // ISO UTC
}

const ORDER: StageId[] = STAGES.map((s) => s.id);

/**
 * Fase "actual" para posicionar las pantallas: la del primer partido (en orden
 * cronológico) cuyo kickoff aún es futuro — donde todavía se pueden hacer picks.
 * Si todos ya arrancaron, la última fase del torneo que tenga partidos. Si la
 * lista está vacía, J1 (fallback defensivo).
 *
 * Es pura (recibe `nowMs`, no llama a Date.now()) para poder testear los bordes
 * de forma determinista y calcularla en el servidor sin riesgo de hidratación.
 */
export function currentStage(items: StageItem[], nowMs: number): StageId {
  if (items.length === 0) return 'J1';

  const next = items
    .filter((m) => new Date(m.kickoffUtc).getTime() > nowMs)
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())[0];

  if (next && ORDER.includes(next.stage as StageId)) return next.stage as StageId;

  for (let i = ORDER.length - 1; i >= 0; i--) {
    if (items.some((m) => m.stage === ORDER[i])) return ORDER[i];
  }
  return 'J1';
}
