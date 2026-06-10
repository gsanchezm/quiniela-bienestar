// Componentes compartidos
const { useState, useEffect, useMemo, useRef } = React;
const D = window.QDB_DATA;
const S = window.QDB_STORE;

function Flag({ code, size }) {
  const px = size || 22;
  if (!code) {
    return <span className="flag flag-tbd" style={{ width: px * 1.45, height: px }}>?</span>;
  }
  return (
    <img className="flag" alt="" draggable="false"
      src={D.flagUrl(code)} srcSet={D.flagUrl2x(code) + ' 2x'}
      style={{ height: px }}
      onError={(e) => { e.target.style.visibility = 'hidden'; }} />
  );
}

function TeamFlag({ team, size }) {
  return <Flag code={team ? D.TEAMS[team].flag : null} size={size} />;
}

function Avatar({ user, size }) {
  const px = size || 34;
  const st = { width: px, height: px, fontSize: px * 0.4 };
  if (user && user.photo) {
    return <img className="avatar" src={user.photo} alt="" style={st} />;
  }
  return (
    <span className="avatar avatar-initials" style={{ ...st, background: (user && user.color) || 'var(--accent-dim)' }}>
      {user ? S.initials(user) : '?'}
    </span>
  );
}

// Cuenta regresiva LED
function Countdown({ to, label }) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(to).getTime() - nowMs);
  const dd = Math.floor(diff / 86400000);
  const hh = Math.floor(diff / 3600000) % 24;
  const mm = Math.floor(diff / 60000) % 60;
  const ss = Math.floor(diff / 1000) % 60;
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  const units = [[p2(dd), 'DÍAS'], [p2(hh), 'HRS'], [p2(mm), 'MIN'], [p2(ss), 'SEG']];
  return (
    <div className="countdown">
      {label ? <div className="countdown-label">{label}</div> : null}
      <div className="countdown-digits">
        {units.map(([v, u], i) => (
          <div className="countdown-unit" key={u}>
            <span className="led">{v}</span>
            <span className="countdown-u">{u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Campo de formulario
function Field({ label, type, value, onChange, placeholder, autoFocus, error }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className={'field-input' + (error ? ' field-error' : '')}
        type={type || 'text'} value={value} placeholder={placeholder || ''}
        autoFocus={!!autoFocus}
        onChange={(e) => onChange(e.target.value)} />
      {error ? <span className="field-msg">{error}</span> : null}
    </label>
  );
}

function Btn({ children, onClick, kind, disabled, type }) {
  return (
    <button type={type || 'button'} disabled={!!disabled}
      className={'btn ' + (kind || 'btn-primary')} onClick={onClick}>
      {children}
    </button>
  );
}

// Selector de foto de perfil (opcional)
function PhotoPicker({ photo, onPhoto }) {
  const inputRef = useRef(null);
  const handle = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // reescala a 128px para no llenar localStorage
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = 128;
        c.width = s; c.height = s;
        const ctx = c.getContext('2d');
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, s, s);
        onPhoto(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="photopicker">
      <button type="button" className="photopicker-circle" onClick={() => inputRef.current.click()}>
        {photo
          ? <img src={photo} alt="" />
          : <span className="photopicker-empty"><span className="photopicker-plus">+</span>FOTO</span>}
      </button>
      <div className="photopicker-side">
        <span className="photopicker-hint">Foto de perfil <em>(opcional)</em></span>
        {photo ? <button type="button" className="linklike" onClick={() => onPhoto(null)}>Quitar</button> : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files[0])} />
    </div>
  );
}

Object.assign(window, { Flag, TeamFlag, Avatar, Countdown, Field, Btn, PhotoPicker });
