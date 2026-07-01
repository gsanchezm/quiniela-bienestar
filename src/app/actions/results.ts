'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { isAdmin } from '@/server/admin';
import {
  ResultError,
  assignKnockoutTeams,
  prismaResultsRepo,
  removeResult,
  saveResult,
} from '@/server/services/results';
import {
  getResultsProvider,
  prismaSyncRepo,
  prismaKnockoutAssignRepo,
  prismaKnockoutAdvanceRepo,
  prismaKnockoutReconcileRepo,
  runFullSync,
  type FullSyncSummary,
} from '@/server/services/sync';
import { env } from '@/server/env';
import { getEmailSender } from '@/server/email/sender';

export interface ResultActionResult {
  ok?: boolean;
  error?: string;
  sync?: FullSyncSummary;
}

class Forbidden extends Error {}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) throw new Forbidden('Solo administradores.');
  return user;
}

function refreshAll() {
  revalidatePath('/partidos');
  revalidatePath('/tabla');
  revalidatePath('/resultados');
}

async function runAdminAction(fn: () => Promise<void>): Promise<ResultActionResult> {
  try {
    await requireAdmin();
    await fn();
  } catch (e) {
    if (e instanceof ResultError || e instanceof Forbidden) return { error: e.message };
    throw e;
  }
  refreshAll();
  return { ok: true };
}

export async function saveResultAction(
  matchId: number,
  homeGoals: number,
  awayGoals: number,
  penWinner: 'H' | 'A' | null,
): Promise<ResultActionResult> {
  return runAdminAction(() =>
    saveResult(prismaResultsRepo(db), matchId, { homeGoals, awayGoals, penWinner }),
  );
}

export async function clearResultAction(matchId: number): Promise<ResultActionResult> {
  return runAdminAction(() => removeResult(prismaResultsRepo(db), matchId));
}

export async function assignTeamsAction(
  matchId: number,
  homeCode: string,
  awayCode: string,
): Promise<ResultActionResult> {
  return runAdminAction(() => assignKnockoutTeams(prismaResultsRepo(db), matchId, homeCode, awayCode));
}

export async function syncNowAction(): Promise<ResultActionResult> {
  try {
    await requireAdmin();
    const provider = getResultsProvider();
    if (!provider) {
      return { error: 'Configura FOOTBALL_DATA_TOKEN para sincronizar; mientras, captura manual.' };
    }
    const summary = await runFullSync({
      provider,
      syncRepo: prismaSyncRepo(db),
      assignRepo: prismaKnockoutAssignRepo(db),
      advanceRepo: prismaKnockoutAdvanceRepo(db),
      reconcileRepo: prismaKnockoutReconcileRepo(db),
      sender: getEmailSender(),
      adminEmails: env.adminEmails,
      appUrl: env.appUrl,
    });
    refreshAll();
    return { ok: true, sync: summary };
  } catch (e) {
    if (e instanceof Forbidden) return { error: e.message };
    return { error: `No se pudo sincronizar: ${e instanceof Error ? e.message : 'error desconocido'}` };
  }
}
