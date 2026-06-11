'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Outcome } from '@/domain/types';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import {
  PickError,
  clearScorePrediction,
  prismaPicksRepo,
  setOutcome,
  setScorePrediction,
} from '@/server/services/picks';

export interface PickActionResult {
  ok?: boolean;
  error?: string;
}

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

async function runPickAction(fn: () => Promise<void>): Promise<PickActionResult> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof PickError) return { error: e.message };
    throw e;
  }
  revalidatePath('/partidos');
  return { ok: true };
}

export async function pickOutcomeAction(matchId: number, outcome: Outcome): Promise<PickActionResult> {
  const user = await requireUser();
  return runPickAction(() => setOutcome(prismaPicksRepo(db), user.id, matchId, outcome));
}

export async function scorePredictionAction(
  matchId: number,
  predHome: number,
  predAway: number,
): Promise<PickActionResult> {
  const user = await requireUser();
  return runPickAction(() =>
    setScorePrediction(prismaPicksRepo(db), user.id, matchId, predHome, predAway),
  );
}

export async function clearScorePredictionAction(matchId: number): Promise<PickActionResult> {
  const user = await requireUser();
  return runPickAction(() => clearScorePrediction(prismaPicksRepo(db), user.id, matchId));
}
