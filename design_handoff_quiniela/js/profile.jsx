// Configuración de perfil: foto, nombre, correo
const PROFILE_UI = (() => {
  const { useState } = React;
  const S = window.QDB_STORE;

  function ProfileScreen({ st, me, update, onBack }) {
    const [photo, setPhoto] = useState(me.photo);
    const [nombre, setNombre] = useState(me.nombre);
    const [apellido, setApellido] = useState(me.apellido);
    const [email, setEmail] = useState(me.email);
    const [pass, setPass] = useState('');
    const [errs, setErrs] = useState({});
    const [saved, setSaved] = useState(false);

    const submit = () => {
      const e = {};
      if (!nombre.trim()) e.nombre = 'Escribe tu nombre.';
      if (!apellido.trim()) e.apellido = 'Escribe tu apellido.';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Correo inválido.';
      if (st.users.some((u) => u.id !== me.id && u.email.toLowerCase() === email.trim().toLowerCase()))
        e.email = 'Ese correo ya lo usa otro jugador.';
      if (pass && pass.length < 6) e.pass = 'Mínimo 6 caracteres.';
      setErrs(e);
      if (Object.keys(e).length) return;
      update((s) => {
        s.users = s.users.map((u) => u.id === me.id ? {
          ...u,
          photo,
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim().toLowerCase(),
          password: pass ? pass : u.password
        } : u);
      });
      setPass('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    };

    return (
      <div className="screen screen-profile" data-screen-label="Configuración">
        <button className="linklike authback" onClick={onBack}>← Volver a los partidos</button>
        <div className="profilecard">
          <div className="authkicker">TU PERFIL</div>
          <h2 className="authtitle">Configuración</h2>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <PhotoPicker photo={photo} onPhoto={setPhoto} />
            <div className="field-row">
              <Field label="Nombre" value={nombre} onChange={setNombre} error={errs.nombre} />
              <Field label="Apellido" value={apellido} onChange={setApellido} error={errs.apellido} />
            </div>
            <Field label="Correo" type="email" value={email} onChange={setEmail} error={errs.email} />
            <Field label="Nueva contraseña" type="password" value={pass} onChange={setPass}
              placeholder="Déjalo vacío para no cambiarla" error={errs.pass} />
            <div className="profile-actions">
              <Btn type="submit">GUARDAR CAMBIOS</Btn>
              {saved ? <span className="profile-saved">✓ Guardado</span> : null}
            </div>
          </form>
        </div>
        <p className="privnote">Tu foto y nombre aparecen en la tabla de posiciones que ven los demás jugadores.</p>
      </div>
    );
  }

  return { ProfileScreen };
})();
Object.assign(window, PROFILE_UI);
