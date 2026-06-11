'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  clearScorePredictionAction,
  pickOutcomeAction,
  scorePredictionAction,
} from '@/app/actions/picks';
import { Flag } from '@/components/Flag';
import type { MatchView } from '@/server/queries';
import type { Outcome } from '@/domain/types';
import { fmtTime } from '@/lib/dates';

function PickBtn({
  active,
  disabled,
  state,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  state: 'hit' | 'miss' | null;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={'pick' + (active ? ' pick-on' : '') + (state ? ' pick-' + state : '')}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const clean = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 2);

export function MatchCard({ m }: { m: MatchView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tbd = m.isKnockout && (!m.home || !m.away);
  const locked = m.locked;
  const myPick = m.myPick;

  const [hg, setHg] = useState(myPick?.predHome != null ? String(myPick.predHome) : '');
  const [ag, setAg] = useState(myPick?.predAway != null ? String(myPick.predAway) : '');

  // Si el servidor refresca el pick (revalidación), re-sincroniza los inputs.
  useEffect(() => {
    setHg(myPick?.predHome != null ? String(myPick.predHome) : '');
    setAg(myPick?.predAway != null ? String(myPick.predAway) : '');
  }, [myPick?.predHome, myPick?.predAway]);

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  const onPick = (v: Outcome) => {
    if (locked || tbd || pending) return;
    run(() => pickOutcomeAction(m.id, v));
  };

  const savePrediction = () => {
    if (locked || tbd || pending) return;
    const hadPred = myPick?.predHome != null;
    if (hg === '' && ag === '') {
      if (hadPred) run(() => clearScorePredictionAction(m.id));
      return;
    }
    if (hg === '' || ag === '') return; // captura ambos lados para guardar
    const ph = parseInt(hg, 10);
    const pa = parseInt(ag, 10);
    if (ph === myPick?.predHome && pa === myPick?.predAway) return; // sin cambios
    run(() => scorePredictionAction(m.id, ph, pa));
  };

  const name = (t: { name: string } | null) => (t ? t.name : 'Por definir');
  const pickState = (v: Outcome): 'hit' | 'miss' | null => {
    if (!m.outcome || !myPick?.outcome || v !== myPick.outcome) return null;
    return myPick.outcome === m.outcome ? 'hit' : 'miss';
  };

  const lockline = () => {
    if (!locked || tbd) return null;
    let text: string;
    if (m.outcome) {
      if (!myPick) {
        text = 'No registraste pick';
      } else {
        const s = m.myScore;
        if (!s || s.points === 0) text = '✗ Sin punto';
        else if (s.exactHit && s.outcomeHit) text = `🎯 Marcador exacto · +${s.points} puntos`;
        else if (s.exactHit) text = `🎯 Marcador exacto · +${s.points} puntos`;
        else text = '✓ Acertaste · +1 punto';
      }
    } else {
      text = '🔒 Picks cerrados' + (myPick ? ' · tu pick quedó guardado' : ' · no registraste pick');
    }
    return <div className="match-lockline">{text}</div>;
  };

  const predBadge = () => {
    if (!m.result || myPick?.predHome == null) return null;
    const exact = m.myScore?.exactHit;
    return (
      <span className={exact ? 'match-pred-hit' : 'match-pred-miss'}>
        Tu marcador: {myPick.predHome}–{myPick.predAway} {exact ? '· exacto ✓' : ''}
      </span>
    );
  };

  return (
    <article className={'match' + (locked ? ' match-locked' : '') + (m.outcome ? ' match-final' : '')}>
      <header className="match-top">
        <span className="match-tag">{m.isKnockout ? m.tag : 'GRUPO ' + m.group}</span>
        <span className="match-n led-sm">{m.id < 10 ? '0' + m.id : m.id}</span>
        <span className="match-when" suppressHydrationWarning>
          {m.outcome ? 'FINAL' : locked ? 'EN JUEGO / CERRADO' : `${fmtTime(m.kickoffUtc)} hrs`}
        </span>
      </header>

      <div className="match-teams">
        <div className="match-team match-team-h">
          <Flag code={m.home?.flag} size={24} />
          <span className="match-team-name">{name(m.home)}</span>
        </div>
        <div className="match-score">
          {m.result ? (
            <span className="led match-score-led">
              {m.result.homeGoals}
              <i>–</i>
              {m.result.awayGoals}
            </span>
          ) : (
            <span className="match-vs">VS</span>
          )}
          {m.result && m.isKnockout && m.result.homeGoals === m.result.awayGoals && m.result.penWinner ? (
            <span className="match-pens">
              pens: {name(m.result.penWinner === 'H' ? m.home : m.away)}
            </span>
          ) : null}
        </div>
        <div className="match-team match-team-a">
          <span className="match-team-name">{name(m.away)}</span>
          <Flag code={m.away?.flag} size={24} />
        </div>
      </div>

      {tbd ? (
        <div className="match-tbd">Equipos por definir al cerrar la fase anterior</div>
      ) : (
        <>
          <div className={'match-picks' + (m.isKnockout ? ' match-picks-ko' : '')}>
            <PickBtn
              active={myPick?.outcome === 'H'}
              disabled={locked || pending}
              state={pickState('H')}
              onClick={() => onPick('H')}
            >
              {m.isKnockout ? 'GANA ' + name(m.home).toUpperCase() : name(m.home).toUpperCase()}
            </PickBtn>
            {!m.isKnockout && (
              <PickBtn
                active={myPick?.outcome === 'D'}
                disabled={locked || pending}
                state={pickState('D')}
                onClick={() => onPick('D')}
              >
                EMPATE
              </PickBtn>
            )}
            <PickBtn
              active={myPick?.outcome === 'A'}
              disabled={locked || pending}
              state={pickState('A')}
              onClick={() => onPick('A')}
            >
              {m.isKnockout ? 'GANA ' + name(m.away).toUpperCase() : name(m.away).toUpperCase()}
            </PickBtn>
          </div>

          <div className="match-pred">
            <span className="match-pred-label">MARCADOR EXACTO (+2)</span>
            {locked ? (
              myPick?.predHome != null && !m.result ? (
                <span className="match-pred-view">
                  {myPick.predHome}–{myPick.predAway}
                </span>
              ) : (
                predBadge() ?? <span className="match-pred-hint">—</span>
              )
            ) : (
              <>
                <span className="match-pred-inputs">
                  <input
                    className="goal-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="-"
                    value={hg}
                    disabled={pending}
                    onChange={(e) => setHg(clean(e.target.value))}
                    onBlur={savePrediction}
                    aria-label={`Goles de ${name(m.home)}`}
                  />
                  <em>–</em>
                  <input
                    className="goal-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="-"
                    value={ag}
                    disabled={pending}
                    onChange={(e) => setAg(clean(e.target.value))}
                    onBlur={savePrediction}
                    aria-label={`Goles de ${name(m.away)}`}
                  />
                </span>
                {myPick?.predHome != null ? (
                  <button
                    type="button"
                    className="linklike"
                    disabled={pending}
                    onClick={() => run(() => clearScorePredictionAction(m.id))}
                  >
                    Quitar
                  </button>
                ) : (
                  <span className="match-pred-hint">opcional · se guarda al salir del campo</span>
                )}
              </>
            )}
          </div>
        </>
      )}

      {error ? <div className="match-lockline" style={{ color: 'var(--danger)' }}>{error}</div> : null}
      {lockline()}
    </article>
  );
}
