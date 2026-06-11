'use client';

import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { useProfile, signOut } from '@/lib/useProfile';

// Interface Élève — provisoire, sera complétée à l'Étape 4
// (prochaine session, cours en direct, devoirs avec photo).
export default function StudentHome() {
  const router = useRouter();
  const profile = useProfile('student');

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Salut {profile.name} 👋</h1>
          <p className="text-sm text-slate-500">Espace Élève</p>
        </div>
        <button
          onClick={() => signOut(router)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 active:scale-95"
        >
          <LogOut className="h-4 w-4" />
          Quitter
        </button>
      </header>

      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Ton espace (prochaine session, cours en direct, devoirs) arrive à
        l&apos;Étape 4.
      </div>
    </main>
  );
}
