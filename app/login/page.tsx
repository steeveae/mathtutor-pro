'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // 1. Connexion email / mot de passe via Supabase Auth
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.user) {
      // Message précis selon la cause réelle, pour faciliter le diagnostic
      const msg = authError?.message ?? '';
      if (msg.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.');
      } else if (msg.includes('Email not confirmed')) {
        setError(
          "Ce compte n'a pas été confirmé. Le tuteur doit le recréer en cochant « Auto Confirm User »."
        );
      } else if (msg.includes('Invalid API key') || msg.includes('JWT')) {
        setError(
          'Problème de configuration : la clé Supabase enregistrée sur Vercel est invalide.'
        );
      } else {
        setError(`Erreur technique : ${msg || 'serveur injoignable.'}`);
      }
      setLoading(false);
      return;
    }

    // 2. Lecture du rôle pour rediriger vers la bonne interface
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const ROLE_HOME: Record<string, string> = {
      tutor: '/tutor',
      student: '/student',
      parent: '/parent',
    };
    router.replace(ROLE_HOME[profile?.role ?? ''] ?? '/student');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* En-tête */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <GraduationCap className="h-14 w-14 text-indigo-600" />
          <h1 className="text-2xl font-bold">MathTutor Pro</h1>
          <p className="text-sm text-slate-500">Connectez-vous pour continuer</p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Mot de passe</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 p-3 font-semibold text-white transition active:scale-95 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Les comptes sont créés par votre tuteur.
        </p>
      </div>
    </main>
  );
}
