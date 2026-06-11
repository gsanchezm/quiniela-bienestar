'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { updateProfileAction, type ProfileFormState } from '@/app/actions/profile';
import { Field } from '@/components/Field';
import { PhotoPicker } from '@/components/profile/PhotoPicker';

export function ProfileForm({
  me,
  aviso,
}: {
  me: { nombre: string; apellido: string; email: string; photo: string | null };
  aviso?: string;
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {});

  return (
    <div className="screen screen-profile">
      <Link className="linklike authback" href="/partidos">
        ← Volver a los partidos
      </Link>
      <div className="profilecard">
        <div className="authkicker">TU PERFIL</div>
        <h2 className="authtitle">Configuración</h2>
        {aviso === 'correo-actualizado' ? (
          <p className="notice">✓ Tu correo quedó actualizado.</p>
        ) : null}
        <form action={action}>
          <PhotoPicker initial={me.photo} />
          <div className="field-row">
            <Field label="Nombre" name="nombre" defaultValue={me.nombre} />
            <Field label="Apellido" name="apellido" defaultValue={me.apellido} />
          </div>
          <Field label="Correo" name="email" type="email" defaultValue={me.email} />
          <Field
            label="Nueva contraseña"
            name="password"
            type="password"
            placeholder="Déjalo vacío para no cambiarla"
            error={state.error}
          />
          <div className="profile-actions">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}
            </button>
            {state.ok ? <span className="profile-saved">✓ Guardado</span> : null}
          </div>
          {state.emailPending ? (
            <p className="authhint">
              📬 Te mandamos un correo a tu dirección nueva — el cambio se aplica cuando lo confirmes.
            </p>
          ) : null}
        </form>
      </div>
      <p className="privnote">Tu foto y nombre aparecen en la tabla de posiciones que ven los demás jugadores.</p>
    </div>
  );
}
