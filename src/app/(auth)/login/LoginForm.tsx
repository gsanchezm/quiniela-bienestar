'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type FormState } from '@/app/actions/auth';
import { Field } from '@/components/Field';

export function LoginForm({ aviso }: { aviso?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <div className="authcard authcard-flat">
      <Link className="authback linklike" href="/">
        ← Volver
      </Link>
      <div className="authkicker">BIENVENIDO DE VUELTA</div>
      <h2 className="authtitle">Iniciar sesión</h2>
      {aviso === 'enlace-invalido' ? (
        <p className="alertbar">Ese enlace ya no es válido. Inicia sesión o solicita uno nuevo.</p>
      ) : null}
      {aviso === 'cuenta-activada' ? (
        <p className="okbar">✅ ¡Tu cuenta fue activada! Inicia sesión para llenar tu quiniela.</p>
      ) : null}
      <form action={action}>
        <Field
          label="Correo"
          name="email"
          type="email"
          placeholder="tu@correo.com"
          autoFocus
          autoComplete="email"
          defaultValue={state.email}
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          error={state.error}
        />
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'ENTRANDO…' : 'ENTRAR A LA CANCHA'}
        </button>
      </form>
      <div className="authlinks">
        <Link className="linklike" href="/olvide">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link className="linklike" href="/registro">
          Crear cuenta nueva
        </Link>
      </div>
    </div>
  );
}
