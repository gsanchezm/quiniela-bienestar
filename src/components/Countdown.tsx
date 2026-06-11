'use client';

import { useEffect, useState } from 'react';
import { pad2 } from '@/lib/dates';

// Cuenta regresiva LED del prototipo (js/ui.jsx). Arranca tras montar para
// no desfasar la hidratación.
export function Countdown({ to, label }: { to: string; label?: string }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = nowMs === null ? 0 : Math.max(0, new Date(to).getTime() - nowMs);
  const dd = Math.floor(diff / 86_400_000);
  const hh = Math.floor(diff / 3_600_000) % 24;
  const mm = Math.floor(diff / 60_000) % 60;
  const ss = Math.floor(diff / 1_000) % 60;
  const units: Array<[string, string]> = [
    [pad2(dd), 'DÍAS'],
    [pad2(hh), 'HRS'],
    [pad2(mm), 'MIN'],
    [pad2(ss), 'SEG'],
  ];

  return (
    <div className="countdown">
      {label ? <div className="countdown-label">{label}</div> : null}
      <div className="countdown-digits">
        {units.map(([v, u]) => (
          <div className="countdown-unit" key={u}>
            <span className="led" suppressHydrationWarning>
              {nowMs === null ? '--' : v}
            </span>
            <span className="countdown-u">{u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
