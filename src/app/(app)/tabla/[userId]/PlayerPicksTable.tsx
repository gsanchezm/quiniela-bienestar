'use client';

import { useEffect, useState } from 'react';
import { Flag } from '@/components/Flag';
import type { StageId } from '@/data/worldcup2026';
import type { PlayerPickRowView } from '@/server/queries';
import { fmtTime } from '@/lib/dates';
import { StageBar } from '@/components/matches/StageBar';

// Detalle de picks por jugador (port de js/standings.jsx PlayerDetail).
// La ocultación de picks ajenos ya viene aplicada desde el servidor.
export function PlayerPicksTable({ rows }: { rows: PlayerPickRowView[] }) {
  const [stage, setStage] = useState<StageId>('J1');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const list = rows.filter((r) => r.match.stage === stage);

  return (
    <>
      <StageBar stage={stage} onStage={setStage} />
      <div className="pickstable">
        {list.map(({ match: m, hidden }) => {
          const pick = m.myPick;
          const name = (t: { name: string } | null) => (t ? t.name : '—');
          const pickLabel =
            pick?.outcome === 'H'
              ? name(m.home)
              : pick?.outcome === 'A'
                ? name(m.away)
                : pick?.outcome === 'D'
                  ? 'Empate'
                  : '—';
          const cls =
            m.outcome && pick?.outcome ? (pick.outcome === m.outcome ? ' row-hit' : ' row-miss') : '';
          return (
            <div className={'pickrow' + cls} key={m.id}>
              <span className="pickrow-n led-sm">{m.id < 10 ? '0' + m.id : m.id}</span>
              <span className="pickrow-match">
                <Flag code={m.home?.flag} size={14} /> {name(m.home)}
                <em> vs </em>
                {name(m.away)} <Flag code={m.away?.flag} size={14} />
              </span>
              <span className="pickrow-res">
                {m.result ? (
                  <span className="led led-sm">
                    {m.result.homeGoals}–{m.result.awayGoals}
                  </span>
                ) : (
                  <span className="pickrow-pend" suppressHydrationWarning>
                    {m.locked ? 'en juego' : mounted ? fmtTime(m.kickoffUtc) : ''}
                  </span>
                )}
              </span>
              <span className="pickrow-pick">
                {hidden ? (
                  <span className="pickrow-hidden">🔒 oculto</span>
                ) : (
                  <>
                    {pickLabel}
                    {pick?.predHome != null ? (
                      <small>
                        {' '}
                        · {pick.predHome}–{pick.predAway}
                        {m.myScore?.exactHit ? ' 🎯' : ''}
                      </small>
                    ) : null}
                  </>
                )}
              </span>
              <span className="pickrow-mark">
                {m.outcome && pick?.outcome ? (pick.outcome === m.outcome ? '✓' : '✗') : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="privnote">Los picks de otros jugadores se revelan hasta que cada partido cierra.</p>
    </>
  );
}
