// Regla "cierre al silbatazo": un pick no puede crearse/cambiarse desde el kickoff.
export function isLocked(kickoffUtc: Date, now: Date): boolean {
  return now.getTime() >= kickoffUtc.getTime();
}
