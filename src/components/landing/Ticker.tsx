import { Flag } from '@/components/Flag';
import { MATCHES, TEAMS } from '@/data/worldcup2026';

// Ticker de partidos de la J1 (dos filas idénticas para el loop infinito).
export function Ticker() {
  const items = MATCHES.filter((m) => m.stage === 'J1');
  const row = (key: string) => (
    <div className="ticker-row" key={key}>
      {items.map((m) => (
        <span className="ticker-item" key={key + m.id}>
          <Flag code={TEAMS[m.homeCode!].flag} size={14} />
          <span>{TEAMS[m.homeCode!].name}</span>
          <span className="ticker-vs">VS</span>
          <span>{TEAMS[m.awayCode!].name}</span>
          <Flag code={TEAMS[m.awayCode!].flag} size={14} />
          <span className="ticker-dot">●</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="ticker">
      {row('a')}
      {row('b')}
    </div>
  );
}
