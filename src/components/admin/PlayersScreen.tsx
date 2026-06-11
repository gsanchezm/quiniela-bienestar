'use client';

import { useState, useTransition } from 'react';
import {
  adminResetLinkAction,
  confirmPlayerAction,
  deletePlayerAction,
  setPlayerAdminAction,
} from '@/app/actions/players';
import { Avatar } from '@/components/Avatar';
import type { PlayerRowView } from '@/server/queries';

function PlayerRow({ p, meId }: { p: PlayerRowView; meId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMe = p.id === meId;
  const manageable = !isMe && !p.isSuper;

  const run = (fn: () => Promise<{ error?: string; resetUrl?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      if (res.resetUrl) setResetUrl(res.resetUrl);
    });
  };

  const copy = async () => {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="admrow">
      <span className="admrow-teams">
        <Avatar user={p} size={28} />
        <span>
          {p.nombre} {p.apellido} <em>{p.email}</em>
        </span>
        {isMe ? <span className="badge badge-accent">TÚ</span> : null}
        {p.isSuper ? <span className="badge badge-accent">SUPER-ADMIN</span> : null}
        {!p.isSuper && p.isAdmin ? <span className="badge badge-accent">ADMIN</span> : null}
        {!p.confirmed ? <span className="badge badge-warn">PENDIENTE</span> : null}
        <span className="badge">{p.totalPicks} picks</span>
      </span>
      <span className="admrow-actions">
        {!p.confirmed ? (
          <button
            className="btn btn-mini"
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmPlayerAction(p.id))}
          >
            ✓ Confirmar cuenta
          </button>
        ) : null}
        {manageable ? (
          <>
            <button
              className="btn btn-mini btn-ghost"
              type="button"
              disabled={pending}
              onClick={() => run(() => adminResetLinkAction(p.id))}
            >
              🔑 Enlace de reset
            </button>
            <button
              className="btn btn-mini btn-ghost"
              type="button"
              disabled={pending}
              onClick={() => run(() => setPlayerAdminAction(p.id, !p.isAdmin))}
            >
              {p.isAdmin ? 'Quitar admin' : 'Hacer admin'}
            </button>
            {confirmingDelete ? (
              <>
                <button
                  className="btn btn-mini"
                  type="button"
                  style={{ background: 'var(--danger)', boxShadow: 'none' }}
                  disabled={pending}
                  onClick={() => run(() => deletePlayerAction(p.id))}
                >
                  Sí, borrar definitivo
                </button>
                <button
                  className="btn btn-mini btn-ghost"
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                className="btn btn-mini btn-ghost"
                type="button"
                disabled={pending}
                onClick={() => setConfirmingDelete(true)}
              >
                Borrar
              </button>
            )}
          </>
        ) : null}
      </span>
      {resetUrl ? (
        <span className="resetlink">
          <input className="field-input" readOnly value={resetUrl} onFocus={(e) => e.target.select()} />
          <button className="btn btn-mini" type="button" onClick={copy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <span className="match-pred-hint">válido 2 horas — compártelo por WhatsApp</span>
        </span>
      ) : null}
      {error ? <span className="admrow-error">{error}</span> : null}
    </div>
  );
}

export function PlayersScreen({ players, meId }: { players: PlayerRowView[]; meId: string }) {
  const pendientes = players.filter((p) => !p.confirmed).length;
  return (
    <div className="screen">
      <div className="stagehead">
        <h2 className="stagetitle">Jugadores</h2>
        <div className="stageprogress">
          <span className="led led-sm">{players.length < 10 ? '0' + players.length : players.length}</span>
          <span className="stageprogress-label">PARTICIPANTES</span>
        </div>
      </div>
      <div className="notice">
        Aquí confirmas cuentas nuevas (cuando el correo no les llega), generas enlaces para restablecer
        contraseñas, nombras administradores y das de baja participantes.
        {pendientes > 0 ? (
          <>
            {' '}
            <strong>
              {pendientes} pendiente{pendientes === 1 ? '' : 's'} de confirmar.
            </strong>
          </>
        ) : null}
      </div>
      <div className="admlist">
        {players.map((p) => (
          <PlayerRow key={p.id} p={p} meId={meId} />
        ))}
      </div>
      <p className="privnote">
        Los super-admins vienen de la variable ADMIN_EMAILS y no se pueden modificar desde aquí. Borrar a
        un participante elimina también todos sus picks.
      </p>
    </div>
  );
}
