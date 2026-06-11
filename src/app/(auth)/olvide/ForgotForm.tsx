'use client';

import { useActionState } from 'react';
import { forgotAction, type FormState } from '@/app/actions/auth';
import { Field } from '@/components/Field';

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotAction, {});

  if (state.ok) {
    return (
      <div className="authok">
        <div className="authok-icon">✉</div>
        <p>
          Si ese correo está registrado, ya va en camino un enlace para
          <br />
          restablecer tu contraseña (vigente 2 horas).
        </p>
        <p className="authhint">
          ¿No te llega el correo? Pídele al organizador de la quiniela un enlace de restablecimiento —
          te lo puede mandar por WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="authnote">Escribe tu correo y te mandamos un enlace para restablecer tu contraseña.</p>
      <form action={action}>
        <Field label="Correo" name="email" type="email" placeholder="tu@correo.com" autoFocus error={state.error} />
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'ENVIANDO…' : 'ENVIAR ENLACE'}
        </button>
      </form>
      <p className="authhint">
        ¿No te llega el correo? Pídele al organizador de la quiniela un enlace de restablecimiento.
      </p>
    </>
  );
}
