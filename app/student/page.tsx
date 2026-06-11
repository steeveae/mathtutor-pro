'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Camera,
  CalendarDays,
  Clock,
  Home,
  Loader2,
  LogOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile, signOut } from '@/lib/useProfile';
import { fmtDate, fmtTime } from '@/lib/format';

// ---------- Types ----------
type Session = {
  id: string;
  scheduled_time: string;
  start_time: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  live_content: string | null;
};

type Homework = {
  id: string;
  description: string;
  deadline: string | null;
  photo_url: string | null;
  feedback: string | null;
  status: 'pending' | 'submitted' | 'graded';
};

const HOMEWORK_STATUS: Record<
  Homework['status'],
  { label: string; cls: string }
> = {
  pending: { label: 'À faire', cls: 'bg-amber-100 text-amber-800' },
  submitted: { label: 'Envoyé ✓', cls: 'bg-blue-100 text-blue-800' },
  graded: { label: 'Corrigé', cls: 'bg-emerald-100 text-emerald-800' },
};

// ============================================================
// Interface Élève : 2 onglets (Accueil / Devoirs) avec
// navigation fixe en bas d'écran, pensée pour le téléphone.
// ============================================================
export default function StudentApp() {
  const router = useRouter();
  const profile = useProfile('student');
  const [tab, setTab] = useState<'home' | 'homeworks'>('home');

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-4 pb-24">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Salut {profile.name} 👋</h1>
          <p className="text-sm text-slate-500">Espace Élève</p>
        </div>
        <button
          onClick={() => signOut(router)}
          title="Déconnexion"
          className="rounded-xl border border-slate-300 p-2 text-slate-600 active:scale-95"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {tab === 'home' ? (
        <HomeTab studentId={profile.id} />
      ) : (
        <HomeworksTab studentId={profile.id} />
      )}

      {/* Barre de navigation fixe en bas (mobile-first) */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
        <div className="mx-auto grid max-w-md grid-cols-2">
          <button
            onClick={() => setTab('home')}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold ${
              tab === 'home' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Home className="h-6 w-6" />
            Accueil
          </button>
          <button
            onClick={() => setTab('homeworks')}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold ${
              tab === 'homeworks' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <BookOpen className="h-6 w-6" />
            Devoirs
          </button>
        </div>
      </nav>
    </main>
  );
}

// ============================================================
// Onglet ACCUEIL : cours en direct (temps réel) ou prochaine
// session en gros.
// ============================================================
function HomeTab({ studentId }: { studentId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('id, scheduled_time, start_time, status, live_content')
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_time');
    setSessions((data as Session[]) ?? []);
    setLoading(false);
  }, []);

  // Recharge à chaque changement poussé par le tuteur (Realtime) :
  // démarrage de session, nouveau contenu, fin de session…
  useEffect(() => {
    load();
    const channel = supabase
      .channel('student-sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `student_id=eq.${studentId}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, studentId]);

  if (loading) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-indigo-600" />;
  }

  const live = sessions.find((s) => s.status === 'in_progress');
  const next = sessions.find((s) => s.status === 'scheduled');

  // --- Cours en direct ---
  if (live) {
    return (
      <section className="rounded-2xl border-2 border-emerald-500 bg-white shadow">
        <div className="flex items-center gap-2 rounded-t-xl bg-emerald-500 px-4 py-3 font-bold text-white">
          <span className="relative flex h-3 w-3">
            <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative h-3 w-3 rounded-full bg-white" />
          </span>
          Cours en direct
          {live.start_time && (
            <span className="ml-auto text-sm font-normal opacity-90">
              depuis {fmtTime(live.start_time)}
            </span>
          )}
        </div>
        <div className="min-h-[40vh] p-4">
          {live.live_content ? (
            <p className="whitespace-pre-wrap text-lg leading-relaxed">
              {live.live_content}
            </p>
          ) : (
            <p className="mt-12 text-center text-slate-400">
              Ton tuteur va envoyer le contenu du cours ici…
            </p>
          )}
        </div>
      </section>
    );
  }

  // --- Pas de cours en direct : prochaine session en gros ---
  return (
    <section className="rounded-2xl bg-indigo-600 p-6 text-white shadow">
      <p className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wide opacity-80">
        <CalendarDays className="h-4 w-4" /> Prochaine session
      </p>
      {next ? (
        <>
          <p className="text-3xl font-extrabold capitalize">
            {fmtDate(next.scheduled_time)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xl">
            <Clock className="h-5 w-5" /> {fmtTime(next.scheduled_time)}
          </p>
          <p className="mt-4 text-sm opacity-80">
            Quand ton tuteur démarrera la session, le cours s&apos;affichera ici
            automatiquement. 📲
          </p>
        </>
      ) : (
        <p className="text-lg">
          Aucune session planifiée pour l&apos;instant. Repasse plus tard !
        </p>
      )}
    </section>
  );
}

// ============================================================
// Onglet DEVOIRS : liste des devoirs + envoi de photo.
// ============================================================
function HomeworksTab({ studentId }: { studentId: string }) {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('homeworks')
      .select('id, description, deadline, photo_url, feedback, status')
      .order('created_at', { ascending: false });
    setHomeworks((data as Homework[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-indigo-600" />;
  }

  if (homeworks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Aucun devoir pour l&apos;instant. 🎉
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {homeworks.map((hw) => {
        const badge = HOMEWORK_STATUS[hw.status];
        return (
          <li
            key={hw.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-semibold">{hw.description}</p>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>
            {hw.deadline && (
              <p className="mb-3 flex items-center gap-1 text-sm text-slate-500">
                <Clock className="h-4 w-4" /> Pour le {fmtDate(hw.deadline)}
              </p>
            )}

            {/* Correction du tuteur */}
            {hw.status === 'graded' && hw.feedback && (
              <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-bold">Correction du tuteur :</p>
                <p className="whitespace-pre-wrap">{hw.feedback}</p>
              </div>
            )}

            {/* Envoi (ou renvoi) de la photo tant que ce n'est pas corrigé */}
            {hw.status !== 'graded' && (
              <UploadButton hw={hw} studentId={studentId} onDone={load} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------
// Bouton d'envoi de photo : ouvre l'appareil photo ou la
// galerie, envoie le fichier dans le bucket privé "homeworks"
// puis marque le devoir comme "submitted".
// ------------------------------------------------------------
function UploadButton({
  hw,
  studentId,
  onDone,
}: {
  hw: Homework;
  studentId: string;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    // Chemin imposé par la politique Storage : dossier = uid de l'élève
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${studentId}/${hw.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('homeworks')
      .upload(path, file);
    if (uploadError) {
      setError("Échec de l'envoi. Vérifie ta connexion et réessaie.");
      setUploading(false);
      return;
    }

    await supabase
      .from('homeworks')
      .update({ photo_url: path, status: 'submitted' })
      .eq('id', hw.id);
    setUploading(false);
    onDone();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Camera className="h-5 w-5" />
        )}
        {uploading
          ? 'Envoi en cours…'
          : hw.status === 'submitted'
            ? 'Renvoyer une autre photo'
            : 'Photographier mon devoir'}
      </button>
      {error && (
        <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
    </>
  );
}
