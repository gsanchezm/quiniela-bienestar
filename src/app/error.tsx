'use client';

import { useEffect } from 'react';

// Pestañas abiertas durante un deploy mandan IDs de server actions del build
// anterior y Next las rechaza. Aquí se recarga una sola vez automáticamente
// (con candado de tiempo para no ciclar) en lugar de pedirle al usuario F5.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const staleDeploy = /server action|deployment/i.test(error.message);
    const last = Number(sessionStorage.getItem('qdb-auto-reload') ?? 0);
    if (staleDeploy && Date.now() - last > 60_000) {
      sessionStorage.setItem('qdb-auto-reload', String(Date.now()));
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="authwrap">
      <div className="authcard" style={{ textAlign: 'center' }}>
        <div className="authkicker">TIEMPO FUERA</div>
        <h2 className="authtitle">La app se actualizó</h2>
        <p className="authnote">Recarga la página para seguir con la versión nueva.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            RECARGAR
          </button>
          <button className="btn btn-ghost" type="button" onClick={reset}>
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}
