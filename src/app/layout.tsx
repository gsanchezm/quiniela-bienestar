import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Quiniela del Bienestar — Mundial 2026',
  description:
    'Quiniela entre amigos para la Copa Mundial 2026: llena tu quiniela, suma puntos y sube en la tabla.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
