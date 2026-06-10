// Landing animada + Login + Registro + Correo de confirmación + Recuperar contraseña
const AUTH = (() => {
  const { useState, useEffect, useMemo } = React;
  const D = window.QDB_DATA;
  const S = window.QDB_STORE;

  // ---------- fondo animado de estadio ----------
  function StadiumBackdrop({ dim, video }) {
    return (
      <div className={'stadium' + (dim ? ' stadium-dim' : '')} aria-hidden="true">
        <div className="stadium-grass"></div>
        {video ? (
          <div className="stadium-video">
            <iframe
              src="https://www.youtube.com/embed/smiF90YexLY?autoplay=1&mute=1&controls=0&loop=1&playlist=smiF90YexLY&playsinline=1&rel=0&iv_load_policy=3&disablekb=1"
              title="Video oficial Mundial 2026" frameBorder="0" tabIndex="-1"
              allow="autoplay; encrypted-media"></iframe>
          </div>
        ) : null}
        <div className="stadium-sweep"></div>
        <div className="stadium-line stadium-line-mid"></div>
        <div className="stadium-circle"></div>
        <div className="stadium-vignette"></div>
      </div>
    );
  }

  // ---------- ticker de partidos ----------
  function Ticker() {
    const items = D.MATCHES.filter((m) => m.stage === 'J1');
    const row = (key) => (
      <div className="ticker-row" key={key}>
        {items.map((m) => (
          <span className="ticker-item" key={key + m.id}>
            <TeamFlag team={m.h} size={14} />
            <span>{D.TEAMS[m.h].name}</span>
            <span className="ticker-vs">VS</span>
            <span>{D.TEAMS[m.a].name}</span>
            <TeamFlag team={m.a} size={14} />
            <span className="ticker-dot">●</span>
          </span>
        ))}
      </div>
    );
    return <div className="ticker">{row('a')}{row('b')}</div>;
  }

  // ---------- Landing ----------
  function Landing({ go, bgVideo }) {
    return (
      <div className="landing" data-screen-label="Landing">
        <StadiumBackdrop video={bgVideo} />
        <div className="landing-top">
          <span className="landing-badge">COPA MUNDIAL 2026 · MÉXICO / EE.UU. / CANADÁ</span>
        </div>
        <div className="landing-center">
          <img className="landing-logo" src="assets/logo.png"
            alt="Quiniela del Bienestar 2026 — jugamos, predicimos, ganamos todos" />
          <p className="landing-sub">104 partidos · 48 selecciones · una sola quiniela entre amigos</p>
          <Countdown to={D.KICKOFF} label="EL BALÓN RUEDA EN" />
          <div className="landing-actions">
            <Btn onClick={() => go('login')}>INICIAR SESIÓN</Btn>
            <Btn kind="btn-ghost" onClick={() => go('signup')}>CREAR CUENTA</Btn>
          </div>
          <div className="landing-features">
            <div className="lfcard">
              <span className="lfcard-n led">01</span>
              <h3>Llena tu quiniela</h3>
              <p>Gana, empata o gana en los 104 partidos del Mundial.</p>
            </div>
            <div className="lfcard">
              <span className="lfcard-n led">02</span>
              <h3>Cierra al silbatazo</h3>
              <p>Los picks se bloquean cuando inicia cada partido.</p>
            </div>
            <div className="lfcard">
              <span className="lfcard-n led">03</span>
              <h3>Sube en la tabla</h3>
              <p>1 punto por acierto y posiciones en vivo contra tus rivales.</p>
            </div>
          </div>
        </div>
        <Ticker />
      </div>
    );
  }

  // ---------- marco para formularios ----------
  function AuthShell({ title, kicker, children, onBack, screenLabel }) {
    return (
      <div className="authwrap" data-screen-label={screenLabel}>
        <StadiumBackdrop dim />
        <div className="authcard">
          <button className="authback linklike" onClick={onBack}>← Volver</button>
          <div className="authkicker">{kicker}</div>
          <h2 className="authtitle">{title}</h2>
          {children}
        </div>
      </div>
    );
  }

  // ---------- correo simulado ----------
  function EmailScreen({ to, subject, heading, body, cta, onCta, onBack, screenLabel }) {
    return (
      <div className="authwrap" data-screen-label={screenLabel}>
        <StadiumBackdrop dim />
        <div className="mailcard">
          <div className="mail-chrome">
            <span className="mail-chrome-title">BANDEJA DE ENTRADA</span>
            <span className="mail-chrome-new">1 nuevo</span>
          </div>
          <div className="mail-head">
            <div className="mail-avatar">QB</div>
            <div className="mail-meta">
              <div className="mail-from">Quiniela del Bienestar <span>&lt;no-reply@quinieladelbienestar.mx&gt;</span></div>
              <div className="mail-to">para {to}</div>
            </div>
            <div className="mail-time">ahora</div>
          </div>
          <div className="mail-subject">{subject}</div>
          <div className="mail-body">
            <div className="mail-logo"><img src="assets/logo.png" alt="Quiniela del Bienestar" /></div>
            <h3>{heading}</h3>
            <p>{body}</p>
            <button className="btn btn-primary mail-cta" onClick={onCta}>{cta}</button>
            <p className="mail-foot">Si no fuiste tú, ignora este correo.<br />Copa Mundial 2026 · México · EE.UU. · Canadá</p>
          </div>
          <div className="mail-note">✉️ Correo simulado para el prototipo — en producción se enviaría a tu bandeja real.</div>
          <button className="authback linklike mail-back" onClick={onBack}>← Volver</button>
        </div>
      </div>
    );
  }

  // ---------- carrusel de noticias (login) ----------
  function NewsCarousel({ go }) {
    const slides = [
      {
        id: 'apertura', kicker: '11 DE JUNIO · PARTIDO INAUGURAL',
        head: (<span>MÉXICO ABRE EL MUNDIAL ANTE <em>SUDÁFRICA</em> EN EL <u>AZTECA</u></span>),
        cta: 'LLENA TU QUINIELA', hint: 'foto: estadio azteca'
      },
      {
        id: 'formato', kicker: 'MUNDIAL 2026 · MÉXICO / EE.UU. / CANADÁ',
        head: (<span><em>104</em> PARTIDOS, <em>48</em> SELECCIONES Y UNA SOLA <u>QUINIELA</u> ENTRE AMIGOS</span>),
        cta: 'CREAR CUENTA', hint: 'foto: afición'
      },
      {
        id: 'cierre', kicker: 'REGLAS DE LA CASA',
        head: (<span>TUS PICKS SE <em>CIERRAN</em> AL SILBATAZO INICIAL — <u>NO TE DUERMAS</u></span>),
        cta: 'CREAR CUENTA', hint: 'foto: balón / cancha'
      },
      {
        id: 'puntos', kicker: 'TABLA EN VIVO',
        head: (<span>CADA ACIERTO VALE <em>1 PUNTO</em>: DEMUESTRA QUIÉN <u>SABE DE FUTBOL</u></span>),
        cta: 'CREAR CUENTA', hint: 'foto: festejo de gol'
      }
    ];
    const [idx, setIdx] = useState(0);
    const [paused, setPaused] = useState(false);
    useEffect(() => {
      if (paused) return;
      const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
      return () => clearInterval(t);
    }, [paused, slides.length]);
    const prev = () => setIdx((idx + slides.length - 1) % slides.length);
    const next = () => setIdx((idx + 1) % slides.length);
    return (
      <div className="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {slides.map((s, i) => (
          <div key={s.id} className={'car-slide' + (i === idx ? ' car-on' : '')} aria-hidden={i !== idx}>
            <image-slot id={'login-foto-' + s.id} class="car-photo" shape="rect" placeholder={s.hint}></image-slot>
            <div className="car-fade"></div>
            <div className="car-copy">
              <span className="car-kicker">{s.kicker}</span>
              <h3 className="car-head">{s.head}</h3>
              <button className="btn btn-primary car-cta" onClick={() => go('signup')}>{s.cta}</button>
            </div>
          </div>
        ))}
        <div className="car-nav">
          <button className="car-arrow" onClick={prev} aria-label="Anterior">‹</button>
          <div className="car-nums">
            {slides.map((s, i) => (
              <button key={s.id} className={'car-num' + (i === idx ? ' car-num-on' : '')}
                onClick={() => setIdx(i)}>{i + 1}</button>
            ))}
          </div>
          <button className="car-arrow" onClick={next} aria-label="Siguiente">›</button>
        </div>
      </div>
    );
  }

  // ---------- Login ----------
  function Login({ st, go, onLogin }) {
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [err, setErr] = useState(null);
    const submit = () => {
      const u = st.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || u.password !== pass) { setErr('Correo o contraseña incorrectos.'); return; }
      if (!u.confirmed) { setErr('Tu cuenta aún no está confirmada. Revisa tu correo.'); return; }
      onLogin(u.id);
    };
    return (
      <div className="authwrap authwrap-login" data-screen-label="Login">
        <StadiumBackdrop dim />
        <div className="loginsplit">
          <NewsCarousel go={go} />
          <div className="authcard authcard-flat">
            <button className="authback linklike" onClick={() => go('landing')}>← Volver</button>
            <div className="authkicker">BIENVENIDO DE VUELTA</div>
            <h2 className="authtitle">Iniciar sesión</h2>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <Field label="Correo" type="email" value={email} onChange={setEmail} placeholder="tu@correo.com" autoFocus />
              <Field label="Contraseña" type="password" value={pass} onChange={setPass} placeholder="••••••••" error={err} />
              <Btn type="submit">ENTRAR A LA CANCHA</Btn>
            </form>
            <div className="authlinks">
              <button className="linklike" onClick={() => go('forgot')}>¿Olvidaste tu contraseña?</button>
              <button className="linklike" onClick={() => go('signup')}>Crear cuenta nueva</button>
            </div>
            <div className="authdemo">Demo: <code>carlos@demo.mx</code> / <code>demo123</code></div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Registro ----------
  function Signup({ st, update, go, setPendingEmail }) {
    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [errs, setErrs] = useState({});
    const submit = () => {
      const e = {};
      if (!nombre.trim()) e.nombre = 'Escribe tu nombre.';
      if (!apellido.trim()) e.apellido = 'Escribe tu apellido.';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Correo inválido.';
      if (pass.length < 6) e.pass = 'Mínimo 6 caracteres.';
      if (st.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()))
        e.email = 'Ese correo ya está registrado.';
      setErrs(e);
      if (Object.keys(e).length) return;
      const id = 'u_' + Math.random().toString(36).slice(2, 9);
      const colors = ['#e0a83c','#5aa9e6','#e26d5c','#9d79bc','#6cae75','#d96fa8'];
      const user = {
        id, nombre: nombre.trim(), apellido: apellido.trim(),
        email: email.trim().toLowerCase(), password: pass,
        photo: null, demo: false, confirmed: false,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
      update((s) => { s.users = s.users.concat([user]); s.picks[id] = {}; });
      setPendingEmail(user.email);
      go('confirm-email');
    };
    return (
      <AuthShell title="Crear cuenta" kicker="ÚNETE A LA QUINIELA" onBack={() => go('landing')} screenLabel="Registro">
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field-row">
            <Field label="Nombre" value={nombre} onChange={setNombre} placeholder="Nombre" autoFocus error={errs.nombre} />
            <Field label="Apellido" value={apellido} onChange={setApellido} placeholder="Apellido" error={errs.apellido} />
          </div>
          <Field label="Correo" type="email" value={email} onChange={setEmail} placeholder="tu@correo.com" error={errs.email} />
          <Field label="Contraseña" type="password" value={pass} onChange={setPass} placeholder="Mínimo 6 caracteres" error={errs.pass} />
          <p className="authhint">Tu foto de perfil la puedes agregar después desde Configuración.</p>
          <Btn type="submit">REGISTRARME</Btn>
        </form>
        <div className="authlinks">
          <button className="linklike" onClick={() => go('login')}>Ya tengo cuenta</button>
        </div>
      </AuthShell>
    );
  }

  // ---------- confirmación ----------
  function ConfirmEmail({ st, update, go, pendingEmail, onLogin }) {
    const confirm = () => {
      let uid = null;
      update((s) => {
        s.users = s.users.map((u) => {
          if (u.email === pendingEmail) { uid = u.id; return { ...u, confirmed: true }; }
          return u;
        });
      });
      const u = st.users.find((x) => x.email === pendingEmail);
      if (u) onLogin(u.id);
    };
    return (
      <EmailScreen
        screenLabel="Correo de confirmación"
        to={pendingEmail}
        subject="⚽ Confirma tu cuenta — Quiniela del Bienestar"
        heading="¡Ya casi estás en la cancha!"
        body="Haz clic en el botón para confirmar tu cuenta y empezar a llenar tu quiniela del Mundial 2026."
        cta="CONFIRMAR MI CUENTA"
        onCta={confirm}
        onBack={() => go('landing')} />
    );
  }

  // ---------- recuperar contraseña ----------
  function Forgot({ st, go, setPendingEmail }) {
    const [email, setEmail] = useState('');
    const [err, setErr] = useState(null);
    const submit = () => {
      const u = st.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) { setErr('No encontramos ese correo.'); return; }
      setPendingEmail(u.email);
      go('reset-email');
    };
    return (
      <AuthShell title="Recuperar contraseña" kicker="TIEMPO FUERA" onBack={() => go('login')} screenLabel="Recuperar contraseña">
        <p className="authnote">Escribe tu correo y te mandamos un enlace para restablecer tu contraseña.</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Correo" type="email" value={email} onChange={setEmail} placeholder="tu@correo.com" autoFocus error={err} />
          <Btn type="submit">ENVIAR ENLACE</Btn>
        </form>
      </AuthShell>
    );
  }

  function ResetEmail({ go, pendingEmail }) {
    return (
      <EmailScreen
        screenLabel="Correo de restablecimiento"
        to={pendingEmail}
        subject="🔑 Restablece tu contraseña — Quiniela del Bienestar"
        heading="¿Olvidaste tu contraseña?"
        body="No pasa nada, hasta a los mejores porteros les meten gol. Haz clic abajo para elegir una nueva contraseña."
        cta="RESTABLECER CONTRASEÑA"
        onCta={() => go('reset-form')}
        onBack={() => go('login')} />
    );
  }

  function ResetForm({ update, go, pendingEmail }) {
    const [p1, setP1] = useState('');
    const [p2, setP2] = useState('');
    const [err, setErr] = useState(null);
    const [done, setDone] = useState(false);
    const submit = () => {
      if (p1.length < 6) { setErr('Mínimo 6 caracteres.'); return; }
      if (p1 !== p2) { setErr('Las contraseñas no coinciden.'); return; }
      update((s) => {
        s.users = s.users.map((u) => u.email === pendingEmail ? { ...u, password: p1, confirmed: true } : u);
      });
      setDone(true);
    };
    return (
      <AuthShell title="Nueva contraseña" kicker="ÚLTIMO TOQUE" onBack={() => go('login')} screenLabel="Nueva contraseña">
        {done ? (
          <div className="authok">
            <div className="authok-icon">✓</div>
            <p>¡Listo! Tu contraseña fue actualizada.</p>
            <Btn onClick={() => go('login')}>IR A INICIAR SESIÓN</Btn>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Field label="Nueva contraseña" type="password" value={p1} onChange={setP1} autoFocus />
            <Field label="Repite la contraseña" type="password" value={p2} onChange={setP2} error={err} />
            <Btn type="submit">GUARDAR</Btn>
          </form>
        )}
      </AuthShell>
    );
  }

  // ---------- flujo completo ----------
  function AuthFlow({ st, update, onLogin, bgVideo }) {
    const [view, setView] = useState('landing');
    const [pendingEmail, setPendingEmail] = useState(null);
    const go = setView;
    const props = { st, update, go, onLogin, pendingEmail, setPendingEmail };
    switch (view) {
      case 'login':         return <Login {...props} />;
      case 'signup':        return <Signup {...props} />;
      case 'confirm-email': return <ConfirmEmail {...props} />;
      case 'forgot':        return <Forgot {...props} />;
      case 'reset-email':   return <ResetEmail {...props} />;
      case 'reset-form':    return <ResetForm {...props} />;
      default:              return <Landing go={go} bgVideo={bgVideo} />;
    }
  }

  return { AuthFlow };
})();
Object.assign(window, AUTH);
