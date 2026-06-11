'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  assignTeamsAction,
  clearResultAction,
  saveResultAction,
  syncNowAction,
} from '@/app/actions/results';
import { Flag } from '@/components/Flag';
import { StageBar } from '@/components/matches/StageBar';
import type { StageId } from '@/data/worldcup2026';
import type { MatchView, TeamView } from '@/server/queries';
import type { SyncSummary } from '@/server/services/sync';

const clean = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 2);

function TeamSelect({
  teams,
  value,
  exclude,
  onChange,
  disabled,
}: {
  teams: TeamView[];
  value: string;
  exclude: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select className="adm-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">— equipo —</option>
      {teams.map((t) => (
        <option key={t.code} value={t.code} disabled={t.code === exclude}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function AdminRow({ m, teams }: { m: MatchView; teams: TeamView[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hg, setHg] = useState(m.result ? String(m.result.homeGoals) : '');
  const [ag, setAg] = useState(m.result ? String(m.result.awayGoals) : '');
  const [winner, setWinner] = useState<string>(m.result?.penWinner ?? '');
  const [home, setHome] = useState(m.home?.code ?? '');
  const [away, setAway] = useState(m.away?.code ?? '');

  // Re-sincroniza SOLO cuando los datos del servidor cambian de verdad
  // (deps primitivas): un refresh del router no debe borrar lo que el
  // admin está tecleando.
  useEffect(() => {
    setHg(m.result ? String(m.result.homeGoals) : '');
    setAg(m.result ? String(m.result.awayGoals) : '');
    setWinner(m.result?.penWinner ?? '');
    setHome(m.home?.code ?? '');
    setAway(m.away?.code ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.result?.homeGoals, m.result?.awayGoals, m.result?.penWinner, m.home?.code, m.away?.code]);

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  const needsWinner = m.isKnockout && hg !== '' && hg === ag;
  const teamsMissing = m.isKnockout && (!m.home || !m.away);
  const name = (t: { name: string } | null) => (t ? t.name : '—');

  const save = () => {
    const h = parseInt(hg, 10);
    const a = parseInt(ag, 10);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    run(() => saveResultAction(m.id, h, a, needsWinner ? (winner as 'H' | 'A') : null));
  };

  const applyTeams = (side: 'h' | 'a', value: string) => {
    const nh = side === 'h' ? value : home;
    const na = side === 'a' ? value : away;
    if (side === 'h') setHome(value);
    else setAway(value);
    if (nh && na && nh !== na && (nh !== m.home?.code || na !== m.away?.code)) {
      run(() => assignTeamsAction(m.id, nh, na));
    }
  };

  return (
    <div className="admrow">
      <span className="pickrow-n led-sm">{m.id < 10 ? '0' + m.id : m.id}</span>
      {m.isKnockout ? (
        <span className="admrow-teams">
          <TeamSelect teams={teams} value={home} exclude={away} disabled={pending} onChange={(v) => applyTeams('h', v)} />
          <em>vs</em>
          <TeamSelect teams={teams} value={away} exclude={home} disabled={pending} onChange={(v) => applyTeams('a', v)} />
        </span>
      ) : (
        <span className="admrow-teams">
          <Flag code={m.home?.flag} size={14} /> {name(m.home)} <em>vs</em> {name(m.away)}{' '}
          <Flag code={m.away?.flag} size={14} />
        </span>
      )}
      <span className="admrow-score">
        <input
          className="goal-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={hg}
          placeholder="-"
          disabled={teamsMissing || pending}
          onChange={(e) => setHg(clean(e.target.value))}
        />
        <em>–</em>
        <input
          className="goal-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={ag}
          placeholder="-"
          disabled={teamsMissing || pending}
          onChange={(e) => setAg(clean(e.target.value))}
        />
      </span>
      {needsWinner ? (
        <select className="adm-select" value={winner} onChange={(e) => setWinner(e.target.value)}>
          <option value="">penales…</option>
          <option value="H">{name(m.home)}</option>
          <option value="A">{name(m.away)}</option>
        </select>
      ) : null}
      <span className="admrow-actions">
        <button
          className="btn btn-mini"
          type="button"
          disabled={pending || hg === '' || ag === '' || (needsWinner && !winner)}
          onClick={save}
        >
          {m.result ? 'Actualizar' : 'Finalizar'}
        </button>
        {m.result ? (
          <button
            className="btn btn-mini btn-ghost"
            type="button"
            disabled={pending}
            onClick={() => run(() => clearResultAction(m.id))}
          >
            Borrar
          </button>
        ) : null}
      </span>
      {error ? <span className="admrow-error">{error}</span> : null}
    </div>
  );
}

export function AdminScreen({
  matches,
  teams,
  syncAvailable,
}: {
  matches: MatchView[];
  teams: TeamView[];
  syncAvailable: boolean;
}) {
  const [stage, setStage] = useState<StageId>('J1');
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const list = matches.filter((m) => m.stage === stage);

  const syncNow = () => {
    setSyncError(null);
    startTransition(async () => {
      const res = await syncNowAction();
      if (res.error) setSyncError(res.error);
      if (res.sync) setSummary(res.sync);
    });
  };

  return (
    <div className="screen">
      <div className="stagehead">
        <h2 className="stagetitle">Captura de resultados</h2>
      </div>
      <div className="notice">
        Los marcadores aceptan enteros de 0 a 99. En eliminatorias, si el juego empata, elige al ganador
        de los penales. Al cambiar los equipos de una llave que ya tenía picks, esos picks se borran para
        que la gente vuelva a elegir.
      </div>
      <div className="syncbar">
        <button className="btn btn-mini" type="button" onClick={syncNow} disabled={pending || !syncAvailable}>
          {pending ? 'Sincronizando…' : '⟳ Sincronizar con football-data.org'}
        </button>
        {!syncAvailable ? (
          <span className="sync-summary">Configura FOOTBALL_DATA_TOKEN para habilitar el sync automático.</span>
        ) : null}
        {summary ? (
          <span className="sync-summary">
            ✓ {summary.updated} actualizados · {summary.unchanged} sin cambios · {summary.skippedManual}{' '}
            respetados (manual) · {summary.unmatched} sin emparejar
          </span>
        ) : null}
        {syncError ? <span className="sync-summary" style={{ color: 'var(--danger)' }}>{syncError}</span> : null}
      </div>
      <StageBar stage={stage} onStage={setStage} />
      <div className="admlist">
        {list.map((m) => (
          <AdminRow key={m.id} m={m} teams={teams} />
        ))}
      </div>
    </div>
  );
}
