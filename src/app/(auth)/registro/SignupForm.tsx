'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signupAction, type FormState } from '@/app/actions/auth';
import { Field } from '@/components/Field';

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {});

  if (state.ok) {
    return (
      <div className="authok">
        <div className="authok-icon">✉</div>
        <p>
          Te mandamos un correo a <strong>{state.email}</strong>.<br />
          Haz clic en <strong>“Confirmar mi cuenta”</strong> para entrar a la cancha.
        </p>
        <p className="authhint">¿No llega? Revisa tu carpeta de spam.</p>
      </div>
    );
  }

  return (
    <>
      <form action={action}>
        <div className="field-row">
          <Field label="Nombre" name="nombre" placeholder="Nombre" autoFocus />
          <Field label="Apellido" name="apellido" placeholder="Apellido" />
        </div>
        <Field label="Correo" name="email" type="email" placeholder="tu@correo.com" />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          placeholder="Mínimo 6 caracteres"
          error={state.error}
        />
        <p className="authhint">Tu foto de perfil la puedes agregar después desde Configuración.</p>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'CREANDO…' : 'REGISTRARME'}
        </button>
      </form>
      <div className="authlinks">
        <Link className="linklike" href="/login">
          Ya tengo cuenta
        </Link>
      </div>
    </>
  );
}
