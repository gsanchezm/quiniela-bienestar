'use client';

import { useEffect } from 'react';
import type { MatchView } from '@/server/queries';
import { MatchCard } from '../MatchCard';

// Hoja inferior que reusa el MatchCard completo para capturar el marcador
// exacto (+2) y el ganador de una llave, sin perder ninguna de sus reglas
// (aviso pick≠marcador, lockline, re-sync, pending/error).
export function ScoreSheet({
  m,
  nowMs,
  onClose,
}: {
  m: MatchView;
  nowMs: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="bk-sheet-backdrop" onClick={onClose}>
      <div
        className="bk-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={m.tag ?? 'Detalle de la llave'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bk-sheet-head">
          <span className="bk-sheet-title">{m.tag}</span>
          <button type="button" className="bk-sheet-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <MatchCard m={m} nowMs={nowMs} />
      </div>
    </div>
  );
}
