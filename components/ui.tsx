'use client';

import { useEffect, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Moon, Sun } from 'lucide-react';

// ------------------------------------------------------------
// Avatar : pastille colorée avec les initiales (couleur stable
// par personne, calculée à partir du nom).
// ------------------------------------------------------------
const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-teal-500',
  'bg-orange-500',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const dims = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${color} ${dims}`}
    >
      {initials || '?'}
    </span>
  );
}

// ------------------------------------------------------------
// Skeleton : bloc gris animé affiché pendant les chargements.
// ------------------------------------------------------------
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-2/3" />
    </div>
  );
}

// ------------------------------------------------------------
// MathText : affiche un texte en rendant les formules KaTeX.
//   $...$   → formule dans la ligne     (ex : $2x + 5 = 13$)
//   $$...$$ → formule centrée en grand  (ex : $$\frac{a}{b}$$)
// ------------------------------------------------------------
function renderMath(tex: string, display: boolean) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch {
    return tex;
  }
}

export function MathText({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g);
  return (
    <span className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return (
            <span
              key={i}
              className="block py-1"
              dangerouslySetInnerHTML={{ __html: renderMath(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: renderMath(part.slice(1, -1), false) }}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ------------------------------------------------------------
// Bouton clair/sombre : mémorisé dans le navigateur.
// ------------------------------------------------------------
export function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Mode clair' : 'Mode sombre'}
      className="rounded-xl border border-slate-300 p-2 text-slate-600 active:scale-95 dark:border-slate-600 dark:text-slate-300"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

// ------------------------------------------------------------
// Badge de statut de devoir (partagé Tuteur / Élève / Parent)
// ------------------------------------------------------------
export const HOMEWORK_STATUS: Record<string, { label: string; cls: string }> = {
  pending: {
    label: 'À faire',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  },
  submitted: {
    label: 'Envoyé ✓',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  },
  graded: {
    label: 'Corrigé',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  },
};

export function StatusBadge({ status }: { status: string }) {
  const badge = HOMEWORK_STATUS[status] ?? HOMEWORK_STATUS.pending;
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

// ------------------------------------------------------------
// Compte à rebours / chronomètre (mise à jour chaque seconde)
// ------------------------------------------------------------
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Countdown({ to }: { to: string }) {
  const now = useNow();
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <span>imminent…</span>;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return (
    <span className="tabular-nums">
      {d > 0 && `${d} j `}
      {(d > 0 || h > 0) && `${h} h `}
      {m} min{d === 0 && h === 0 && ` ${s} s`}
    </span>
  );
}

export function Elapsed({ since }: { since: string }) {
  const now = useNow();
  const diff = Math.max(0, now - new Date(since).getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return (
    <span className="tabular-nums">
      {h > 0 && `${h}:`}
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}
