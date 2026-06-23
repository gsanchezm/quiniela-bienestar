'use client';

import { useTransition } from 'react';
import { pickOutcomeAction } from '@/app/actions/picks';
import { Flag } from '@/components/Flag';
import type { Outcome } from '@/domain/types';
import type { MatchView, TeamView } from '@/server/queries';
import { fmtTime } from '@/lib/dates';

// Una caja de partido del cuadro (port de BkBox en js/bracket.jsx).
export function BracketBox({
  m,
  nowMs,
  side,
  variant,
  dim,
  onOpenSheet,
}: {
  m: MatchView | undefined;
  nowMs: number;
  side: 'L' | 'R' | 'C';
  variant?: 'final' | 'third';
  dim?: boolean;
  onOpenSheet: (id: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  if (!m) return null;

  const kickoffMs = new Date(m.kickoffUtc).getTime();
  const locked = m.locked || m.result !== null || nowMs >= kickoffMs;
  const tbd = !m.home || !m.away;
  const out = m.outcome; // 'H' | 'A' | null en eliminatoria
  const myPick = m.myPick?.outcome ?? null;
  const res = m.result;
  const name = (t: TeamView | null) => (t ? t.name : 'Por definir');

  const setPick = (v: Outcome) => {
    if (locked || tbd || pending) return;
    startTransition(async () => {
      await pickOutcomeAction(m.id, v);
    });
  };

  const d = new Date(m.kickoffUtc);
  const status = out
    ? 'FINAL'
    : locked
      ? 'EN JUEGO'
      : `${d.getDate()}/${d.getMonth() + 1} · ${fmtTime(m.kickoffUtc)}`;

  const Row = (sideKey: 'H' | 'A', team: TeamView | null) => {
    const picked = myPick === sideKey;
    const isWinner = !!out && out === sideKey;
    let cls = 'bk-team';
    if (side === 'R') cls += ' bk-team-r';
    if (picked && !out) cls += ' bk-team-on';
    if (out) {
      if (isWinner) cls += ' bk-team-win';
      if (picked && isWinner) cls += ' bk-team-hit';
      if (picked && !isWinner) cls += ' bk-team-miss';
      if (!isWinner) cls += ' bk-team-dim';
    }
    const score = res ? (sideKey === 'H' ? res.homeGoals : res.awayGoals) : null;
    const pen = !!res && m.isKnockout && res.homeGoals === res.awayGoals && res.penWinner === sideKey;
    return (
      <button
        type="button"
        className={cls}
        disabled={locked || tbd || pending}
        onClick={() => setPick(sideKey)}
        title={name(team)}
      >
        <Flag code={team?.flag} size={15} />
        <span className="bk-team-name">{name(team)}</span>
        {score != null ? (
          <span className="bk-team-score led">
            {score}
            {pen ? <i>p</i> : null}
          </span>
        ) : null}
        {picked && !out ? <span className="bk-team-tick">✓</span> : null}
      </button>
    );
  };

  return (
    <div className={'bk-mt' + (variant ? ' bk-mt-' + variant : '') + (dim ? ' bk-mt-dim' : '')}>
      <button
        type="button"
        className="bk-mt-top"
        onClick={() => onOpenSheet(m.id)}
        title="Ver detalle y marcador exacto (+2)"
      >
        <span className="bk-mt-tag">{m.tag}</span>
        {m.myPick?.predHome != null ? (
          <span className="bk-mt-pred">
            {m.myPick.predHome}–{m.myPick.predAway}
          </span>
        ) : null}
        <span className={'bk-mt-when' + (out ? ' bk-mt-when-final' : '')}>{status}</span>
        <span className="bk-mt-edit" aria-hidden="true">✎</span>
      </button>
      {Row('H', m.home)}
      {Row('A', m.away)}
    </div>
  );
}
