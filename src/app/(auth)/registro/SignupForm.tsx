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
        <div className="authok-icon">✓</div>
        <p>
          ¡Listo! Tu cuenta <strong>{state.email}</strong> quedó registrada.
          <br />
          El organizador de la quiniela la <strong>activará en breve</strong> — en cuanto lo haga podrás
          iniciar sesión.
        </p>
        <p className="authhint">Tip: avísale por WhatsApp para que te active más rápido ⚽</p>
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
        <Field label="Correo" name="email" type="email" placeholder="tu@correo.com" autoComplete="email" />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
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
