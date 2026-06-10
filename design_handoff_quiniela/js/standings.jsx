// Tabla de posiciones + detalle de picks por persona
const STANDINGS_UI = (() => {
  const { useState, useMemo } = React;
  const D = window.QDB_DATA;
  const S = window.QDB_STORE;

  function PlayerDetail({ st, me, user, onBack }) {
    const isMe = user.id === me.id;
    const stages = D.STAGES;
    const [stage, setStage] = useState('J1');
    const list = D.MATCHES.filter((m) => m.stage === stage);
    return (
      <div className="screen" data-screen-label="Detalle de jugador">
        <button className="linklike authback" onClick={onBack}>← Tabla de posiciones</button>
        <div className="player-head">
          <Avatar user={user} size={64} />
          <div>
            <h2 className="player-name">{S.fullName(user)}{isMe ? ' (tú)' : ''}</h2>
            <span className="player-sub">{user.demo ? 'Participante demo' : 'Participante'}</span>
          </div>
        </div>
        <div className="stagebar">
          {stages.map((s) => (
            <button key={s.id} className={'stagechip' + (stage === s.id ? ' stagechip-on' : '')}
              onClick={() => setStage(s.id)}>{s.short}</button>
          ))}
        </div>
        <div className="pickstable">
          {list.map((m) => {
            const teams = S.matchTeams(m, st);
            const locked = S.isLocked(m, st);
            const out = S.outcome(m, st);
            const pick = (st.picks[user.id] || {})[m.id] || null;
            const hidden = !isMe && !locked; // picks ajenos ocultos hasta el cierre
            const name = (k) => (k ? D.TEAMS[k].name : '—');
            const pickLabel = pick === 'H' ? name(teams.h) : pick === 'A' ? name(teams.a) : pick === 'D' ? 'Empate' : '—';
            const cls = out && pick ? (pick === out ? ' row-hit' : ' row-miss') : '';
            return (
              <div className={'pickrow' + cls} key={m.id}>
                <span className="pickrow-n led-sm">{m.n < 10 ? '0' + m.n : m.n}</span>
                <span className="pickrow-match">
                  <TeamFlag team={teams.h} size={14} /> {name(teams.h)}
                  <em> vs </em>
                  {name(teams.a)} <TeamFlag team={teams.a} size={14} />
                </span>
                <span className="pickrow-res">
                  {st.results[m.id] ? <span className="led led-sm">{st.results[m.id].hg}–{st.results[m.id].ag}</span> : <span className="pickrow-pend">{locked ? 'en juego' : S.fmtTime(m.utc)}</span>}
                </span>
                <span className="pickrow-pick">
                  {hidden ? <span className="pickrow-hidden">🔒 oculto</span> : pickLabel}
                </span>
                <span className="pickrow-mark">{out && pick ? (pick === out ? '✓' : '✗') : ''}</span>
              </div>
            );
          })}
        </div>
        <p className="privnote">Los picks de otros jugadores se revelan hasta que cada partido cierra.</p>
      </div>
    );
  }

  function StandingsScreen({ st, me }) {
    const [selected, setSelected] = useState(null);
    const rows = useMemo(() => S.computeStandings(st), [st]);
    const finished = D.MATCHES.filter((m) => S.outcome(m, st) !== null).length;

    if (selected) {
      const u = st.users.find((x) => x.id === selected);
      if (u) return <PlayerDetail st={st} me={me} user={u} onBack={() => setSelected(null)} />;
    }

    const medals = ['🥇', '🥈', '🥉'];
    return (
      <div className="screen" data-screen-label="Tabla de posiciones">
        <div className="stagehead">
          <h2 className="stagetitle">Tabla de posiciones</h2>
          <div className="stageprogress">
            <span className="led led-sm">{finished < 10 ? '0' + finished : finished}</span>
            <span className="stageprogress-label">PARTIDOS JUGADOS</span>
          </div>
        </div>
        {finished === 0 && (
          <div className="notice">Aún no hay resultados — los puntos aparecerán cuando termine el primer partido. <br />Cada acierto de <strong>gana / empata / gana</strong> vale <strong>1 punto</strong>.</div>
        )}
        <div className="standings">
          <div className="standings-headrow">
            <span>#</span><span>Jugador</span><span className="ta-r">Aciertos</span><span className="ta-r">Puntos</span>
          </div>
          {rows.map((r, i) => (
            <button key={r.user.id}
              className={'standrow' + (r.user.id === me.id ? ' standrow-me' : '') + (i < 3 && finished > 0 ? ' standrow-top' + (i + 1) : '')}
              onClick={() => setSelected(r.user.id)}>
              <span className="standrow-rank">{finished > 0 && i < 3 ? medals[i] : i + 1}</span>
              <span className="standrow-player">
                <Avatar user={r.user} size={34} />
                <span className="standrow-name">
                  {S.fullName(r.user)}{r.user.id === me.id ? <em> (tú)</em> : null}
                  <small>{r.totalPicks} picks registrados</small>
                </span>
              </span>
              <span className="standrow-hits ta-r">{r.aciertos}<small>/{r.jugados}</small></span>
              <span className="standrow-pts ta-r led">{r.points < 10 ? '0' + r.points : r.points}</span>
            </button>
          ))}
        </div>
        <p className="privnote">Toca a cualquier jugador para ver sus picks partido por partido.</p>
      </div>
    );
  }

  return { StandingsScreen };
})();
Object.assign(window, STANDINGS_UI);
