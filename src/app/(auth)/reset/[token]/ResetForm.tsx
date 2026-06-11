'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { resetAction, type FormState } from '@/app/actions/auth';
import { Field } from '@/components/Field';

export function ResetForm({ token }: { token: string }) {
  const bound = resetAction.bind(null, token);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, {});

  if (state.ok) {
    return (
      <div className="authok">
        <div className="authok-icon">✓</div>
        <p>¡Listo! Tu contraseña fue actualizada.</p>
        <Link className="btn btn-primary" href="/login">
          IR A INICIAR SESIÓN
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <Field label="Nueva contraseña" name="password" type="password" autoFocus />
      <Field label="Repite la contraseña" name="password2" type="password" error={state.error} />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'GUARDANDO…' : 'GUARDAR'}
      </button>
    </form>
  );
}
