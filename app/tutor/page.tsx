'use client';

import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { useProfile, signOut } from '@/lib/useProfile';

// Dashboard Tuteur — provisoire, sera complété à l'Étape 3
// (liste des sessions, démarrer/terminer, facturation 14 jours).
export default function TutorDashboard() {
  const router = useRouter();
  const profile = useProfile('tutor');

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Bonjour {profile.name} 👋</h1>
          <p className="text-sm text-slate-500">Espace Tuteur</p>
        </div>
        <button
          onClick={() => signOut(router)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 active:scale-95"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </header>

      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Le dashboard Tuteur (sessions + facturation) arrive à l&apos;Étape 3.
      </div>
    </main>
  );
}
