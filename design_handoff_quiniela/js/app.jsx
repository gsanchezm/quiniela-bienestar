// App raíz: sesión, navegación y Tweaks
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#4db53c",
  "density": "normal",
  "ledGlow": true,
  "bgVideo": true
}/*EDITMODE-END*/;

function AppHeader({ me, tab, setTab, onLogout, st }) {
  const S = window.QDB_STORE;
  const tabs = [
    { id: 'matches', label: 'PARTIDOS' },
    { id: 'standings', label: 'TABLA' },
    { id: 'admin', label: 'RESULTADOS' }
  ];
  return (
    <header className="apphead">
      <div className="apphead-brand">
        <img className="apphead-logo" src="assets/logo.png" alt="" />
        <span className="apphead-name">QUINIELA <em>DEL BIENESTAR</em></span>
      </div>
      <nav className="apphead-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={'apptab' + (tab === t.id ? ' apptab-on' : '')}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <div className="apphead-user">
        {st.clockOffsetDays ? <span className="demo-clock" title="Reloj adelantado para la demo">⏩ demo</span> : null}
        <button className="apphead-profile" title="Configuración de perfil" onClick={() => setTab('profile')}>
          <Avatar user={me} size={32} />
          <span className="apphead-username">{me.nombre}</span>
        </button>
        <button className="linklike apphead-out" onClick={onLogout}>Salir</button>
      </div>
    </header>
  );
}

function App() {
  const { useState, useEffect, useCallback } = React;
  const S = window.QDB_STORE;
  const [st, setSt] = useState(() => S.load());
  const [tab, setTab] = useState('matches');
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const update = useCallback((fn) => {
    setSt((prev) => {
      const next = { ...prev };
      fn(next);
      S.save(next);
      return next;
    });
  }, []);

  // tweaks -> CSS vars
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--accent', t.accent);
    r.style.setProperty('--accent-dim', t.accent + '33');
    r.classList.toggle('density-compact', t.density === 'compacta');
    r.classList.toggle('no-glow', !t.ledGlow);
  }, [t.accent, t.density, t.ledGlow]);

  const me = st.session ? st.users.find((u) => u.id === st.session) : null;

  const onLogin = (uid) => { update((s) => { s.session = uid; }); setTab('matches'); };
  const onLogout = () => update((s) => { s.session = null; });

  return (
    <React.Fragment>
      {!me ? (
        <AuthFlow st={st} update={update} onLogin={onLogin} bgVideo={t.bgVideo} />
      ) : (
        <div className="app">
          <AppHeader me={me} tab={tab} setTab={setTab} onLogout={onLogout} st={st} />
          <main className="appmain">
            {tab === 'matches' && <MatchesScreen st={st} me={me} update={update} />}
            {tab === 'standings' && <StandingsScreen st={st} me={me} />}
            {tab === 'admin' && <AdminScreen st={st} update={update} />}
            {tab === 'profile' && <ProfileScreen st={st} me={me} update={update} onBack={() => setTab('matches')} />}
          </main>
          <footer className="appfoot">Copa Mundial 2026 · 1 punto por resultado acertado · los picks cierran al silbatazo inicial</footer>
        </div>
      )}
      <TweaksPanel>
        <TweakSection label="Color" />
        <TweakColor label="Acento" value={t.accent}
          options={['#4db53c', '#f2b705', '#f07818', '#3aa6e8']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Estilo" />
        <TweakRadio label="Densidad" value={t.density}
          options={['normal', 'compacta']}
          onChange={(v) => setTweak('density', v)} />
        <TweakToggle label="Brillo LED" value={t.ledGlow}
          onChange={(v) => setTweak('ledGlow', v)} />
        <TweakToggle label="Video de fondo" value={t.bgVideo}
          onChange={(v) => setTweak('bgVideo', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
