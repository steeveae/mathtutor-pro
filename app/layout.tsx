import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MathTutor Pro',
  description:
    'Gestion de cours de mathématiques : sessions en direct, devoirs et facturation bimensuelle.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'MathTutor Pro',
    statusBarStyle: 'default',
  },
};

// Viewport mobile-first (PWA plein écran, pas de zoom pincé accidentel)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
