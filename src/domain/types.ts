// Tipos del dominio — compartidos entre dominio puro, servicios y UI.

export type Outcome = 'H' | 'D' | 'A';

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  penWinner: 'H' | 'A' | null; // solo eliminatoria empatada
}

export interface PickValue {
  outcome: Outcome | null;
  predHome: number | null;
  predAway: number | null;
}

export interface PickScore {
  points: number;
  outcomeHit: boolean;
  exactHit: boolean;
}
