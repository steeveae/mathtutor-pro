'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Loader2,
  Monitor,
  Moon,
  Share,
  Smartphone,
  Sun,
  Type,
  UserCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getInstallPrompt, clearInstallPrompt } from '@/lib/install';
import type { Profile } from '@/lib/types';
import { Avatar } from '@/components/ui';

type Theme = 'light' | 'dark' | 'auto';

// ============================================================
// Onglet PROFIL : installer l'app, modifier son nom,
// personnaliser l'apparence (thème, taille du texte).
// Partagé entre les espaces Tuteur et Élève.
// ============================================================
export default function SettingsTab({ profile }: { profile: Profile }) {
  return (
    <div className="fade-in flex flex-col gap-6">
      <ProfileSection profile={profile} />
      <InstallSection />
      <AppearanceSection />
    </div>
  );
}

// ------------------------------------------------------------
// Mon profil : nom modifiable, email affiché
// ------------------------------------------------------------
function ProfileSection({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('profiles').update({ name: name.trim() }).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <UserCircle className="h-5 w-5 text-indigo-600" /> Mon profil
      </h2>
      <div className="flex items-center gap-3">
        <Avatar name={name || profile.name} />
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ton nom affiché"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
          />
          <p className="mt-1 truncate text-xs text-slate-400">{profile.email}</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      </div>
      {saved && (
        <p className="mt-2 text-xs text-slate-400">
          Le nouveau nom apparaîtra partout au prochain chargement de la page.
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Installer l'application sur l'appareil
// ------------------------------------------------------------
function InstallSection() {
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
    );
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setCanPrompt(!!getInstallPrompt());

    const onInstallable = () => setCanPrompt(true);
    const onInstalled = () => {
      setJustInstalled(true);
      setCanPrompt(false);
    };
    window.addEventListener('pwa-installable', onInstallable);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('pwa-installable', onInstallable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  async function install() {
    const prompt = getInstallPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    clearInstallPrompt();
    setCanPrompt(false);
    if (choice.outcome === 'accepted') setJustInstalled(true);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Smartphone className="h-5 w-5 text-indigo-600" /> Installer l&apos;application
      </h2>

      {installed || justInstalled ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          ✅ L&apos;application est installée sur cet appareil. Lance-la depuis
          l&apos;icône π de ton écran d&apos;accueil.
        </p>
      ) : canPrompt ? (
        <>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            Installe MathTutor Pro sur ton appareil : icône sur l&apos;écran
            d&apos;accueil, plein écran, et notifications fiables.
          </p>
          <button
            onClick={install}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white active:scale-95"
          >
            <Download className="h-5 w-5" /> Installer l&apos;application 📲
          </button>
        </>
      ) : isIOS ? (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="mb-2">Sur iPhone/iPad, l&apos;installation se fait depuis Safari :</p>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              Touche le bouton <Share className="inline h-4 w-4" /> <strong>Partager</strong>{' '}
              (en bas de Safari)
            </li>
            <li>
              Choisis <strong>« Sur l&apos;écran d&apos;accueil »</strong>
            </li>
            <li>
              Touche <strong>« Ajouter »</strong> — l&apos;icône π apparaît 🎉
            </li>
          </ol>
        </div>
      ) : (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="mb-2">Pour installer l&apos;application :</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Sur Android (Chrome)</strong> : menu ⋮ en haut à droite →
              « Ajouter à l&apos;écran d&apos;accueil » → « Installer »
            </li>
            <li>
              <strong>Sur ordinateur (Chrome/Edge)</strong> : icône d&apos;installation{' '}
              <Download className="inline h-4 w-4" /> à droite de la barre d&apos;adresse
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Personnalisation : thème + taille du texte (mémorisés sur
// l'appareil)
// ------------------------------------------------------------
function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>('auto');
  const [bigText, setBigText] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      setTheme(saved === 'dark' ? 'dark' : saved === 'light' ? 'light' : 'auto');
      setBigText(!!localStorage.getItem('fontSize'));
    } catch {}
  }, []);

  function applyTheme(t: Theme) {
    setTheme(t);
    try {
      if (t === 'auto') {
        localStorage.removeItem('theme');
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', dark);
      } else {
        localStorage.setItem('theme', t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      }
    } catch {}
  }

  function applyTextSize(big: boolean) {
    setBigText(big);
    try {
      if (big) {
        localStorage.setItem('fontSize', '18px');
        document.documentElement.style.fontSize = '18px';
      } else {
        localStorage.removeItem('fontSize');
        document.documentElement.style.fontSize = '';
      }
    } catch {}
  }

  const themeBtn = (value: Theme, label: string, Icon: typeof Sun) => (
    <button
      onClick={() => applyTheme(value)}
      className={`flex flex-1 flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-semibold active:scale-95 ${
        theme === value
          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
          : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Sun className="h-5 w-5 text-indigo-600" /> Personnaliser mon espace
      </h2>

      <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Thème</p>
      <div className="mb-4 flex gap-2">
        {themeBtn('light', 'Clair', Sun)}
        {themeBtn('dark', 'Sombre', Moon)}
        {themeBtn('auto', 'Auto', Monitor)}
      </div>

      <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
        Taille du texte
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => applyTextSize(false)}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold active:scale-95 ${
            !bigText
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
              : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          }`}
        >
          <Type className="h-4 w-4" /> Normale
        </button>
        <button
          onClick={() => applyTextSize(true)}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 p-3 font-semibold active:scale-95 ${
            bigText
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
              : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
          }`}
        >
          <Type className="h-6 w-6" /> Grande
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Ces réglages sont mémorisés sur cet appareil.
      </p>
    </section>
  );
}
