import type { Metadata } from 'next';
import { Archivo, Barlow, Barlow_Condensed } from 'next/font/google';
import '@/styles/globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-barlow',
});
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow-condensed',
});
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  title: 'Quiniela del Bienestar — Mundial 2026',
  description:
    'Quiniela entre amigos para la Copa Mundial 2026: llena tu quiniela, suma puntos y sube en la tabla.',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${barlow.variable} ${barlowCondensed.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
