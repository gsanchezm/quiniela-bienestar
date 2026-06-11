import { isLocked } from '@/domain/lock';

// Regla de privacidad (spec §4.3): tus picks siempre; los ajenos solo
// cuando el partido ya cerró. Se aplica en el servidor.
export function canSeePick(viewerId: string, ownerId: string, kickoffUtc: Date, now: Date): boolean {
  return viewerId === ownerId || isLocked(kickoffUtc, now);
}
