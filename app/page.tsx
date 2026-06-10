import { GraduationCap } from 'lucide-react';

// Page d'accueil provisoire (Étape 1).
// Étape 2 : elle redirigera vers /login puis vers le dashboard selon le rôle.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <GraduationCap className="h-16 w-16 text-indigo-600" />
      <h1 className="text-2xl font-bold sm:text-3xl">MathTutor Pro</h1>
      <p className="max-w-sm text-center text-slate-600">
        Étape 1 terminée : projet configuré et schéma de base de données prêt.
        L&apos;authentification arrive à l&apos;Étape 2.
      </p>
    </main>
  );
}
