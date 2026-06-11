'use client';

import { useEffect, useMemo, useState } from 'react';
import { STAGES, type StageId } from '@/data/worldcup2026';
import type { MatchView } from '@/server/queries';
import { dateKey, fmtDate } from '@/lib/dates';
import { MatchCard } from './MatchCard';
import { StageBar } from './StageBar';

// Pantalla de Partidos (port de js/matches.jsx). La agrupación por fecha usa
// la hora LOCAL del navegador, así que se renderiza tras montar.
export function MatchesScreen({ matches }: { matches: MatchView[] }) {
  const [stage, setStage] = useState<StageId>('J1');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const list = useMemo(() => matches.filter((m) => m.stage === stage), [matches, stage]);

  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: MatchView[] }> = [];
    let cur: (typeof out)[number] | null = null;
    for (const m of list) {
      const k = dateKey(m.kickoffUtc);
      if (!cur || cur.key !== k) {
        cur = { key: k, label: fmtDate(m.kickoffUtc), items: [] };
        out.push(cur);
      }
      cur.items.push(m);
    }
    return out;
  }, [list]);

  const pickable = list.filter((m) => !(m.isKnockout && (!m.home || !m.away)));
  const done = pickable.filter((m) => m.myPick && (m.myPick.outcome !== null || m.myPick.predHome !== null)).length;

  return (
    <div className="screen">
      <StageBar stage={stage} onStage={setStage} />
      <div className="stagehead">
        <h2 className="stagetitle">{STAGES.find((s) => s.id === stage)!.label}</h2>
        {pickable.length > 0 && (
          <div className="stageprogress">
            <span className="led led-sm">
              {done}/{pickable.length}
            </span>
            <span className="stageprogress-label">PICKS</span>
            <span className="stageprogress-bar">
              <i style={{ width: (100 * done) / Math.max(1, pickable.length) + '%' }} />
            </span>
          </div>
        )}
      </div>

      {!mounted ? (
        <div className="empty">Cargando partidos…</div>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} className="dategroup">
              <h3 className="datehead">{g.label}</h3>
              <div className="matchlist">
                {g.items.map((m) => (
                  <MatchCard key={m.id} m={m} />
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && <div className="empty">No hay partidos en esta fase todavía.</div>}
        </>
      )}
    </div>
  );
}
