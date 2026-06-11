'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HeaderTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: '/partidos', label: 'PARTIDOS' },
    { href: '/tabla', label: 'TABLA' },
    // Tabs exclusivos de administradores (spec §4.4).
    ...(isAdmin
      ? [
          { href: '/resultados', label: 'RESULTADOS' },
          { href: '/jugadores', label: 'JUGADORES' },
        ]
      : []),
  ];
  return (
    <nav className="apphead-tabs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={'apptab' + (pathname.startsWith(t.href) ? ' apptab-on' : '')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
