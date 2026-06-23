'use client';

import { connPath, CONNW, H } from './layout';

// Conector SVG en codo entre dos columnas del cuadro.
export function BracketConn({
  feeders,
  straight,
  dir,
}: {
  feeders?: number;
  straight?: boolean;
  dir: 'l2r' | 'r2l';
}) {
  const d = connPath({ feeders, straight, dir });
  return (
    <div className="bk-conn" aria-hidden="true">
      <svg viewBox={`0 0 ${CONNW} ${H}`} preserveAspectRatio="none">
        <path d={d} />
      </svg>
    </div>
  );
}
