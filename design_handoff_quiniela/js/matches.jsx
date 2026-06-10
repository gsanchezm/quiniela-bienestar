// Pantalla de partidos y picks
const MATCHES_UI = (() => {
  const { useState, useMemo } = React;
  const D = window.QDB_DATA;
  const S = window.QDB_STORE;

  function PickBtn({ active, disabled, onClick, children, state }) {
    // state: 'hit' | 'miss' | null (tras resultado final)
    return (
      <button
        className={'pick' + (active ? ' pick-on' : '') + (state ? ' pick-' + state : '')}
        disabled={disabled} onClick={onClick}>
        {children}
      </button>
    );
  }

  function MatchCard({ m, st, me, update }) {
    const teams = S.matchTeams(m, st);
    const locked = S.isLocked(m, st);
    const res = st.results[m.id];
    const out = S.outcome(m, st);
    const myPick = (st.picks[me.id] || {})[m.id] || null;
    const tbd = m.ko && (!teams.h || !teams.a);

    const setPick = (v) => {
      if (locked || tbd) return;
      update((s) => {
        if (!s.picks[me.id]) s.picks[me.id] = {};
        if (s.picks[me.id][m.id] === v) delete s.picks[me.id][m.id];
        else s.picks[me.id][m.id] = v;
      });
    };

    const name = (k) => (k ? D.TEAMS[k].name : 'Por definir');
    const pickState = (v) => {
      if (!out || !myPick) return null;
      if (v !== myPick) return null;
      return myPick === out ? 'hit' : 'miss';
    };

    return (
      <article className={'match' + (locked ? ' match-locked' : '') + (out ? ' match-final' : '')}>
        <header className="match-top">
          <span className="match-tag">{m.ko ? m.tag : 'GRUPO ' + m.group}</span>
          <span className="match-n led-sm">{m.n < 10 ? '0' + m.n : m.n}</span>
          <span className="match-when">
            {out ? 'FINAL' : (locked ? 'EN JUEGO / CERRADO' : S.fmtTime(m.utc) + ' hrs')}
          </span>
        </header>
        <div className="match-teams">
          <div className="match-team match-team-h">
            <TeamFlag team={teams.h} size={24} />
            <span className="match-team-name">{name(teams.h)}</span>
          </div>
          <div className="match-score">
            {res ? (
              <span className="led match-score-led">{res.hg}<i>–</i>{res.ag}</span>
            ) : (
              <span className="match-vs">VS</span>
            )}
            {res && m.ko && res.hg === res.ag && res.winner ? (
              <span className="match-pens">pens: {name(teams[res.winner === 'H' ? 'h' : 'a'])}</span>
            ) : null}
          </div>
          <div className="match-team match-team-a">
            <span className="match-team-name">{name(teams.a)}</span>
            <TeamFlag team={teams.a} size={24} />
          </div>
        </div>
        {tbd ? (
          <div className="match-tbd">Equipos por definir al cerrar la fase anterior</div>
        ) : (
          <div className={'match-picks' + (m.ko ? ' match-picks-ko' : '')}>
            <PickBtn active={myPick === 'H'} disabled={locked} state={pickState('H')} onClick={() => setPick('H')}>
              {m.ko ? 'GANA ' + name(teams.h).toUpperCase() : name(teams.h).toUpperCase()}
            </PickBtn>
            {!m.ko && (
              <PickBtn active={myPick === 'D'} disabled={locked} state={pickState('D')} onClick={() => setPick('D')}>
                EMPATE
              </PickBtn>
            )}
            <PickBtn active={myPick === 'A'} disabled={locked} state={pickState('A')} onClick={() => setPick('A')}>
              {m.ko ? 'GANA ' + name(teams.a).toUpperCase() : name(teams.a).toUpperCase()}
            </PickBtn>
          </div>
        )}
        {locked && !tbd ? (
          <div className="match-lockline">
            {out
              ? (myPick ? (myPick === out ? '✓ Acertaste · +1 punto' : '✗ Sin punto') : 'No registraste pick')
              : '🔒 Picks cerrados' + (myPick ? ' · tu pick quedó guardado' : ' · no registraste pick')}
          </div>
        ) : null}
      </article>
    );
  }

  function MatchesScreen({ st, me, update }) {
    const [stage, setStage] = useState('J1');
    const list = useMemo(() => D.MATCHES.filter((m) => m.stage === stage), [stage]);

    // agrupar por fecha
    const groups = useMemo(() => {
      const out = [];
      let cur = null;
      list.forEach((m) => {
        const k = S.dateKey(m.utc);
        if (!cur || cur.key !== k) { cur = { key: k, label: S.fmtDate(m.utc), items: [] }; out.push(cur); }
        cur.items.push(m);
      });
      return out;
    }, [list, st.clockOffsetDays]);

    const pickable = list.filter((m) => !S.isLocked(m, st) && !(m.ko && !(st.koTeams[m.id] && st.koTeams[m.id].h && st.koTeams[m.id].a)));
    const totalPickable = list.filter((m) => !(m.ko && !(st.koTeams[m.id] && st.koTeams[m.id].h && st.koTeams[m.id].a)));
    const done = totalPickable.filter((m) => (st.picks[me.id] || {})[m.id]).length;

    return (
      <div className="screen" data-screen-label="Partidos">
        <div className="stagebar">
          {D.STAGES.map((s) => (
            <button key={s.id}
              className={'stagechip' + (stage === s.id ? ' stagechip-on' : '')}
              onClick={() => setStage(s.id)}>
              {s.short}
            </button>
          ))}
        </div>
        <div className="stagehead">
          <h2 className="stagetitle">{D.STAGES.find((s) => s.id === stage).label}</h2>
          {totalPickable.length > 0 && (
            <div className="stageprogress">
              <span className="led led-sm">{done}/{totalPickable.length}</span>
              <span className="stageprogress-label">PICKS</span>
              <span className="stageprogress-bar"><i style={{ width: (100 * done / Math.max(1, totalPickable.length)) + '%' }}></i></span>
            </div>
          )}
        </div>
        {groups.map((g) => (
          <section key={g.key} className="dategroup">
            <h3 className="datehead">{g.label}</h3>
            <div className="matchlist">
              {g.items.map((m) => <MatchCard key={m.id} m={m} st={st} me={me} update={update} />)}
            </div>
          </section>
        ))}
        {groups.length === 0 && <div className="empty">No hay partidos en esta fase todavía.</div>}
      </div>
    );
  }

  return { MatchesScreen };
})();
Object.assign(window, MATCHES_UI);
