// Panel de administración: captura de resultados + equipos de eliminatorias
const ADMIN_UI = (() => {
  const { useState } = React;
  const D = window.QDB_DATA;
  const S = window.QDB_STORE;

  function TeamSelect({ value, onChange, exclude }) {
    const keys = Object.keys(D.TEAMS).sort((a, b) => D.TEAMS[a].name.localeCompare(D.TEAMS[b].name));
    return (
      <select className="adm-select" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— equipo —</option>
        {keys.map((k) => (
          <option key={k} value={k} disabled={k === exclude}>{D.TEAMS[k].name}</option>
        ))}
      </select>
    );
  }

  function AdminRow({ m, st, update }) {
    const teams = S.matchTeams(m, st);
    const res = st.results[m.id] || null;
    const [hg, setHg] = useState(res ? String(res.hg) : '');
    const [ag, setAg] = useState(res ? String(res.ag) : '');
    const [winner, setWinner] = useState(res ? (res.winner || '') : '');
    const name = (k) => (k ? D.TEAMS[k].name : '—');
    const clean = (v) => v.replace(/[^0-9]/g, '').slice(0, 2); // solo dígitos, sin negativos
    const needsWinner = m.ko && hg !== '' && hg === ag;

    const saveRes = () => {
      const h = parseInt(hg, 10), a = parseInt(ag, 10);
      if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
      if (m.ko && h === a && !winner) return;
      update((s) => {
        s.results = { ...s.results, [m.id]: { hg: h, ag: a, winner: (m.ko && h === a) ? winner : null } };
      });
    };
    const clearRes = () => {
      setHg(''); setAg(''); setWinner('');
      update((s) => {
        const r = { ...s.results }; delete r[m.id]; s.results = r;
      });
    };
    const setKoTeam = (side, val) => {
      update((s) => {
        const cur = s.koTeams[m.id] || { h: null, a: null };
        s.koTeams = { ...s.koTeams, [m.id]: { ...cur, [side]: val } };
      });
    };

    return (
      <div className="admrow">
        <span className="pickrow-n led-sm">{m.n < 10 ? '0' + m.n : m.n}</span>
        {m.ko ? (
          <span className="admrow-teams">
            <TeamSelect value={teams.h} exclude={teams.a} onChange={(v) => setKoTeam('h', v)} />
            <em>vs</em>
            <TeamSelect value={teams.a} exclude={teams.h} onChange={(v) => setKoTeam('a', v)} />
          </span>
        ) : (
          <span className="admrow-teams admrow-teams-fixed">
            <TeamFlag team={teams.h} size={14} /> {name(teams.h)} <em>vs</em> {name(teams.a)} <TeamFlag team={teams.a} size={14} />
          </span>
        )}
        <span className="admrow-score">
          <input className="adm-goal" type="text" inputMode="numeric" pattern="[0-9]*" value={hg} placeholder="-"
            onChange={(e) => setHg(clean(e.target.value))} disabled={m.ko && (!teams.h || !teams.a)} />
          <em>–</em>
          <input className="adm-goal" type="text" inputMode="numeric" pattern="[0-9]*" value={ag} placeholder="-"
            onChange={(e) => setAg(clean(e.target.value))} disabled={m.ko && (!teams.h || !teams.a)} />
        </span>
        {needsWinner ? (
          <select className="adm-select adm-select-pens" value={winner} onChange={(e) => setWinner(e.target.value)}>
            <option value="">penales…</option>
            <option value="H">{name(teams.h)}</option>
            <option value="A">{name(teams.a)}</option>
          </select>
        ) : null}
        <span className="admrow-actions">
          <button className="btn btn-mini" onClick={saveRes} disabled={hg === '' || ag === '' || (needsWinner && !winner)}>
            {res ? 'Actualizar' : 'Finalizar'}
          </button>
          {res ? <button className="btn btn-mini btn-ghost" onClick={clearRes}>Borrar</button> : null}
        </span>
      </div>
    );
  }

  function AdminScreen({ st, update }) {
    const [stage, setStage] = useState('J1');
    const list = D.MATCHES.filter((m) => m.stage === stage);

    const simulateJ1 = () => {
      update((s) => {
        const r = { ...s.results };
        D.MATCHES.filter((m) => m.stage === 'J1').forEach((m, i) => {
          const seed = (m.n * 2654435761) >>> 0;
          const hg = seed % 4, ag = (seed >> 3) % 3;
          r[m.id] = { hg: hg, ag: ag, winner: null };
        });
        s.results = r;
        s.clockOffsetDays = 8; // adelanta el reloj para que J1 quede cerrada
      });
    };
    const resetDemo = () => {
      update((s) => {
        const r = { ...s.results };
        D.MATCHES.filter((m) => m.stage === 'J1').forEach((m) => { delete r[m.id]; });
        s.results = r;
        s.clockOffsetDays = 0;
      });
    };

    return (
      <div className="screen" data-screen-label="Admin">
        <div className="stagehead">
          <h2 className="stagetitle">Captura de resultados</h2>
        </div>
        <div className="notice">
          <strong>Nota:</strong> en producción los marcadores pueden llegar solos desde una API gratuita
          (p. ej. football-data.org o API-Football) con un pequeño servidor; este prototipo guarda todo en tu navegador,
          así que aquí los capturas tú. Las eliminatorias se habilitan asignando los equipos de cada llave.
        </div>
        <div className="adm-demo">
          <button className="btn btn-mini" onClick={simulateJ1}>⚡ Simular resultados de J1 (demo)</button>
          <button className="btn btn-mini btn-ghost" onClick={resetDemo}>Restaurar (hoy real, sin resultados)</button>
        </div>
        <div className="stagebar">
          {D.STAGES.map((s) => (
            <button key={s.id} className={'stagechip' + (stage === s.id ? ' stagechip-on' : '')}
              onClick={() => setStage(s.id)}>{s.short}</button>
          ))}
        </div>
        <div className="admlist">
          {list.map((m) => <AdminRow key={m.id + (st.results[m.id] ? '_r' : '_n')} m={m} st={st} update={update} />)}
        </div>
      </div>
    );
  }

  return { AdminScreen };
})();
Object.assign(window, ADMIN_UI);
