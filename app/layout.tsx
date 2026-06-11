import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

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
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Applique le thème sombre AVANT le rendu pour éviter le flash blanc */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} min-h-screen bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-900 dark:text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
