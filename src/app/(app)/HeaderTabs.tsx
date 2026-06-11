'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HeaderTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: '/partidos', label: 'PARTIDOS' },
    { href: '/tabla', label: 'TABLA' },
    // El tab Resultados solo existe para admins (spec §4.4).
    ...(isAdmin ? [{ href: '/resultados', label: 'RESULTADOS' }] : []),
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
