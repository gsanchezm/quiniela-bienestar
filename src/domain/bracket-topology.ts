// src/domain/bracket-topology.ts
// Topología verificada del cuadro KO del Mundial 2026 (ver spec 2026-06-30 y
// memoria quiniela-bracket-topologia-2026). Datos 2026-específicos hardcodeados
// (YAGNI). El árbol NO es consecutivo (verificado con 6 fuentes).

// Slot oficial R32 (73-88, Esquema X/FIFA) → par de códigos de equipo.
export const R32_TEAMS: Record<number, readonly [string, string]> = {
  73: ['RSA', 'CAN'], 74: ['GER', 'PAR'], 75: ['NED', 'MAR'], 76: ['BRA', 'JPN'],
  77: ['FRA', 'SWE'], 78: ['CIV', 'NOR'], 79: ['MEX', 'ECU'], 80: ['ENG', 'COD'],
  81: ['USA', 'BIH'], 82: ['BEL', 'SEN'], 83: ['POR', 'CRO'], 84: ['ESP', 'AUT'],
  85: ['SUI', 'ALG'], 86: ['ARG', 'CPV'], 87: ['COL', 'GHA'], 88: ['AUS', 'EGY'],
};

// Padre → [feederA (→local/H), feederB (→visitante/A)]. Solo GANADOR (final 104
// incluida). El 3.º lugar (103) se maneja aparte con los perdedores de semis.
export const FEEDERS: Record<number, readonly [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  104: [101, 102],
};
export const THIRD_PLACE_ID = 103;
export const THIRD_PLACE_FEEDERS: readonly [number, number] = [101, 102]; // perdedores de semis

// Orden de display por columna (izquierda | derecha), 0-based.
export const DISPLAY_ORDER: Record<string, readonly number[]> = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
};

const pairKey = (a: string, b: string) => [a, b].slice().sort().join('|');

const R32_BY_PAIR = new Map<string, number>(
  Object.entries(R32_TEAMS).map(([slot, [a, b]]) => [pairKey(a, b), Number(slot)]),
);

const WINNER_PARENT = new Map<number, { parentId: number; slot: 'H' | 'A' }>();
for (const [parent, [a, b]] of Object.entries(FEEDERS)) {
  WINNER_PARENT.set(a, { parentId: Number(parent), slot: 'H' });
  WINNER_PARENT.set(b, { parentId: Number(parent), slot: 'A' });
}

/** Slot oficial R32 a partir del par de equipos (orden-independiente); null si no existe. */
export function r32SlotByTeams(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return R32_BY_PAIR.get(pairKey(a, b)) ?? null;
}

/** Casillero destino del GANADOR de `slot`; null si es final/3.º (sin padre). */
export function winnerTarget(slot: number): { parentId: number; slot: 'H' | 'A' } | null {
  return WINNER_PARENT.get(slot) ?? null;
}

/** Casillero destino del PERDEDOR; solo semifinales (101/102 → 3.º lugar). */
export function loserTarget(slot: number): { parentId: number; slot: 'H' | 'A' } | null {
  if (slot === THIRD_PLACE_FEEDERS[0]) return { parentId: THIRD_PLACE_ID, slot: 'H' };
  if (slot === THIRD_PLACE_FEEDERS[1]) return { parentId: THIRD_PLACE_ID, slot: 'A' };
  return null;
}

/** Rango de display (0-based) del slot en su columna; 999 si desconocido. */
export function bracketRank(stage: string, slot: number): number {
  const order = DISPLAY_ORDER[stage];
  if (!order) return 999;
  const i = order.indexOf(slot);
  return i < 0 ? 999 : i;
}
