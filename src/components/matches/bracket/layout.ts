// Geometría y reparto del cuadro de eliminatorias.
// Port de design_handoff_quiniela/js/bracket.jsx (constantes, cy, Conn).
import type { MatchView } from '@/server/queries';

export const H = 700; // alto interno del cuadro (px)
export const COLW = 122; // ancho de columna
export const CONNW = 24; // ancho de conector
export const CENTERW = 176; // ancho de columna central (final)

/** Centro vertical de la caja i (0-based) de un total de k cajas en la columna. */
export const cy = (i: number, k: number) => (H * (2 * i + 1)) / (2 * k);

/**
 * Reparte los partidos de una fase entre el lado izquierdo y el derecho del
 * cuadro: el izquierdo toma las primeras `n` llaves, el derecho el resto.
 * Topología posicional (decorativa), igual que el prototipo.
 */
export function stageSide(
  matches: MatchView[],
  stage: string,
  side: 'L' | 'R',
  n: number,
): MatchView[] {
  const ms = matches.filter((m) => m.stage === stage).sort((a, b) => a.id - b.id);
  return side === 'L' ? ms.slice(0, n) : ms.slice(n);
}

/** Separa la final del partido por el tercer lugar (por su `tag`). */
export function finalAndThird(matches: MatchView[]): {
  final: MatchView | undefined;
  third: MatchView | undefined;
} {
  const fin = matches.filter((m) => m.stage === 'FIN');
  const third = fin.find((m) => /tercer/i.test(m.tag ?? ''));
  const final = fin.find((m) => !/tercer/i.test(m.tag ?? ''));
  return { final, third };
}

/** Genera el atributo `d` del conector SVG en codo entre dos columnas. */
export function connPath({
  feeders,
  straight,
  dir,
}: {
  feeders?: number;
  straight?: boolean;
  dir: 'l2r' | 'r2l';
}): string {
  const mx = CONNW / 2;
  if (straight) return `M0 ${H / 2} H ${CONNW}`;

  let d = '';
  const recv = (feeders ?? 0) / 2;
  for (let r = 0; r < recv; r++) {
    const topY = cy(2 * r, feeders!);
    const botY = cy(2 * r + 1, feeders!);
    const midY = cy(r, recv);
    if (dir === 'l2r') {
      d += `M0 ${topY} H ${mx} M0 ${botY} H ${mx} M ${mx} ${topY} V ${botY} M ${mx} ${midY} H ${CONNW} `;
    } else {
      d += `M${CONNW} ${topY} H ${mx} M${CONNW} ${botY} H ${mx} M ${mx} ${topY} V ${botY} M ${mx} ${midY} H 0 `;
    }
  }
  return d;
}
