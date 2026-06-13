'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Camera,
  CalendarDays,
  Clock,
  Download,
  GraduationCap,
  Home,
  Loader2,
  LogOut,
  Send,
  UserCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile, signOut } from '@/lib/useProfile';
import { fmtDate, fmtShortDate, fmtTime } from '@/lib/format';
import {
  askNotificationPermission,
  enablePush,
  notify,
  notificationsSupported,
  registerNotificationWorker,
  sendPush,
} from '@/lib/notify';
import type { Homework, HomeworkFile, Resource, Session, SessionMessage, Slide } from '@/lib/types';
import { CardSkeleton, DarkModeToggle, MathText, StatusBadge } from '@/components/ui';
import AudioCall from '@/components/AudioCall';
import SettingsTab from '@/components/SettingsTab';
import '@/lib/install'; // capture l'invitation d'installation PWA au plus tôt

type HomeworkWithFiles = Homework & { files: HomeworkFile[] };

// ============================================================
// Interface Élève : 3 onglets (Accueil / Cours / Devoirs),
// navigation fixe en bas d'écran, pensée pour le téléphone.
// ============================================================
export default function StudentApp() {
  const router = useRouter();
  const profile = useProfile('student');
  const [tab, setTab] = useState<'home' | 'lessons' | 'homeworks' | 'profile'>('home');
  const [notifOn, setNotifOn] = useState(false);

  useEffect(() => {
    registerNotificationWorker();
    setNotifOn(notificationsSupported() && Notification.permission === 'granted');
  }, []);

  // Renouvelle l'abonnement push de cet appareil à chaque visite
  useEffect(() => {
    if (profile && notificationsSupported() && Notification.permission === 'granted') {
      enablePush(profile.id);
    }
  }, [profile]);

  // Notifications : début de cours et devoir corrigé
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('student-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `student_id=eq.${profile.id}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          const prev = payload.old as { status?: string };
          const prefs = profile?.notification_prefs ?? {};
          if (
            next.status === 'in_progress' &&
            prev.status !== 'in_progress' &&
            prefs.session_start !== false
          ) {
            notify('MathTutor Pro', 'Ton cours commence ! 🎓');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'homeworks',
          filter: `student_id=eq.${profile.id}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          const prefs = profile?.notification_prefs ?? {};
          if (next.status === 'graded' && prefs.homework_graded !== false) {
            notify('MathTutor Pro', 'Ton devoir a été corrigé ✅');
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  if (!profile) {
    return (
      <main className="mx-auto max-w-md p-4">
        <CardSkeleton />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-4 pb-24">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Salut {profile.name} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Espace Élève</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!notifOn && notificationsSupported() && (
            <button
              onClick={async () => {
                const ok = await askNotificationPermission();
                setNotifOn(ok);
                if (ok) {
                  await enablePush(profile.id);
                  notify('MathTutor Pro', 'Notifications activées ✅');
                }
              }}
              title="Activer les notifications"
              className="rounded-xl border border-slate-300 p-2 text-slate-600 active:scale-95 dark:border-slate-600 dark:text-slate-300"
            >
              <Bell className="h-5 w-5" />
            </button>
          )}
          <DarkModeToggle />
          <button
            onClick={() => signOut(router)}
            title="Déconnexion"
            className="rounded-xl border border-slate-300 p-2 text-slate-600 active:scale-95 dark:border-slate-600 dark:text-slate-300"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* L'accueil (qui héberge l'appel audio) reste monté en permanence :
          changer d'onglet ne coupe ni le cours en direct ni l'appel. */}
      <div className={tab === 'home' ? '' : 'hidden'}>
        <HomeTab studentId={profile.id} studentName={profile.name} />
      </div>
      {tab === 'lessons' && <LessonsTab />}
      {tab === 'homeworks' && <HomeworksTab studentId={profile.id} />}
      {tab === 'profile' && <SettingsTab profile={profile} />}

      {/* Barre de navigation fixe en bas */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {(
            [
              { id: 'home', label: 'Accueil', icon: Home },
              { id: 'lessons', label: 'Cours', icon: GraduationCap },
              { id: 'homeworks', label: 'Devoirs', icon: BookOpen },
              { id: 'profile', label: 'Profil', icon: UserCircle },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold ${
                tab === id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

// ============================================================
// ACCUEIL : cours en direct (temps réel + questions) ou
// prochaine session avec compte à rebours.
// ============================================================
function HomeTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select(
        'id, student_id, tutor_id, scheduled_time, start_time, end_time, status, notes, live_content, group_key, subject:subjects(name)'
      )
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_time');
    setSessions((data as unknown as Session[]) ?? []);
    setLoading(false);
  }, []);

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

  if (loading) return <CardSkeleton />;

  const live = sessions.find((s) => s.status === 'in_progress');
  const next = sessions.find((s) => s.status === 'scheduled');

  if (live) return <LiveCourse session={live} studentId={studentId} studentName={studentName} />;

  return (
    <section className="fade-in rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow">
      <p className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wide opacity-80">
        <CalendarDays className="h-4 w-4" /> Prochaine session
      </p>
      {next ? (
        <>
          <p className="text-3xl font-extrabold capitalize">{fmtDate(next.scheduled_time)}</p>
          <p className="mt-1 flex items-center gap-2 text-xl">
            <Clock className="h-5 w-5" /> {fmtTime(next.scheduled_time)}
            {next.subject?.name && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
                {next.subject.name}
              </span>
            )}
          </p>
          <p className="mt-3 rounded-xl bg-white/15 px-4 py-2 text-lg font-bold backdrop-blur">
            ⏳ Dans <NextCountdown to={next.scheduled_time} />
          </p>
          <p className="mt-3 text-sm opacity-80">
            Quand ton tuteur démarrera la session, le cours s&apos;affichera ici
            automatiquement. 📲
          </p>
        </>
      ) : (
        <p className="text-lg">Aucune session planifiée pour l&apos;instant. Repasse plus tard !</p>
      )}
    </section>
  );
}

// Compte à rebours mis à jour chaque seconde
function NextCountdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return <>quelques instants…</>;
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

// ------------------------------------------------------------
// Cours en direct : contenu (formules rendues) + zone pour
// poser une question au tuteur.
// ------------------------------------------------------------
function LiveCourse({
  session,
  studentId,
  studentName,
}: {
  session: Session;
  studentId: string;
  studentName: string;
}) {
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  // Salle audio partagée avec le tuteur (et les autres élèves en collectif)
  const room = session.group_key ?? session.id;

  useEffect(() => {
    let active = true;
    async function loadMessages() {
      const { data } = await supabase
        .from('session_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at');
      if (active) setMessages((data as SessionMessage[]) ?? []);
    }
    loadMessages();
    const channel = supabase
      .channel(`student-messages-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_messages',
          filter: `session_id=eq.${session.id}`,
        },
        () => loadMessages()
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  async function sendQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setSending(true);
    await supabase.from('session_messages').insert({
      session_id: session.id,
      sender_id: studentId,
      content: question.trim(),
    });
    // Notifie le tuteur, même si son app est fermée
    if (session.tutor_id) {
      sendPush({
        user_ids: [session.tutor_id],
        title: 'MathTutor Pro',
        body: `${studentName} : ${question.trim().slice(0, 80)}`,
        event: 'message',
      });
    }
    setQuestion('');
    setSending(false);
  }

  return (
    <section className="fade-in rounded-2xl border-2 border-emerald-500 bg-white shadow dark:bg-slate-800">
      <div className="flex items-center gap-2 rounded-t-xl bg-emerald-500 px-4 py-3 font-bold text-white">
        <span className="relative flex h-3 w-3">
          <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative h-3 w-3 rounded-full bg-white" />
        </span>
        Cours en direct
        {session.subject?.name && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
            {session.subject.name}
          </span>
        )}
        {session.start_time && (
          <span className="ml-auto text-sm font-normal opacity-90">
            depuis {fmtTime(session.start_time)}
          </span>
        )}
      </div>

      {/* Cours audio en direct (WebRTC intégré, sans limite) */}
      <div className="px-4 pt-3">
        <AudioCall room={room} userId={studentId} userName={studentName} />
      </div>

      <div className="min-h-[35vh] p-4">
        {session.live_content ? (
          <MathText text={session.live_content} className="text-lg leading-relaxed" />
        ) : (
          <p className="mt-12 text-center text-slate-400">
            Ton tuteur va envoyer le contenu du cours ici…
          </p>
        )}
      </div>

      {/* Mes questions / réponses */}
      {messages.length > 0 && (
        <ul className="mx-4 mb-2 flex max-h-32 flex-col gap-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
          {messages.map((m) => (
            <li
              key={m.id}
              className={
                m.sender_id === studentId
                  ? 'font-medium text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-700 dark:text-slate-300'
              }
            >
              {m.sender_id === studentId ? 'Moi : ' : 'Tuteur : '}
              <MathText text={m.content} />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={sendQuestion} className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-700">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Poser une question / répondre…"
          className="flex-1 rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={sending || !question.trim()}
          className="rounded-xl bg-emerald-600 px-4 font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </section>
  );
}

// ============================================================
// COURS : documents partagés par le tuteur + cours passés
// (slides + compte rendu) pour réviser.
// ============================================================
function LessonsTab() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [pastSessions, setPastSessions] = useState<(Session & { slides: Slide[] })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: resourceRows }, { data: sessionRows }] = await Promise.all([
        supabase.from('resources').select('*').order('created_at', { ascending: false }),
        supabase
          .from('sessions')
          .select('*, slides(*)')
          .eq('status', 'completed')
          .order('end_time', { ascending: false })
          .limit(20),
      ]);
      setResources((resourceRows as Resource[]) ?? []);
      setPastSessions(
        ((sessionRows as unknown as (Session & { slides: Slide[] })[]) ?? []).filter(
          (s) => s.slides.length > 0 || s.notes
        )
      );
      setLoading(false);
    }
    load();
  }, []);

  async function download(r: Resource) {
    const { data } = await supabase.storage.from('resources').createSignedUrl(r.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  if (loading) return <CardSkeleton />;

  return (
    <div className="fade-in flex flex-col gap-6">
      {/* Documents du tuteur */}
      <section>
        <h2 className="mb-3 text-lg font-bold">📂 Documents de cours</h2>
        {resources.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Aucun document partagé pour l&apos;instant.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {resources.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => download(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {fmtShortDate(r.created_at)}
                    </span>
                  </span>
                  <Download className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cours passés à réviser */}
      <section>
        <h2 className="mb-3 text-lg font-bold">📖 Cours passés</h2>
        {pastSessions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Tes cours passés apparaîtront ici pour réviser.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pastSessions.map((s) => (
              <li key={s.id}>
                <details className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <summary className="cursor-pointer p-4 font-medium capitalize">
                    {s.end_time ? fmtDate(s.end_time) : fmtDate(s.scheduled_time)}
                  </summary>
                  <div className="border-t border-slate-100 p-4 dark:border-slate-700">
                    {s.notes && (
                      <p className="mb-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
                        <span className="font-bold">Compte rendu : </span>
                        {s.notes}
                      </p>
                    )}
                    {s.slides.map((slide) => (
                      <div
                        key={slide.id}
                        className="mb-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900"
                      >
                        <MathText text={slide.content} />
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============================================================
// DEVOIRS : statuts, note /20, correction, envoi de plusieurs
// fichiers (photos, PDF, documents).
// ============================================================
function HomeworksTab({ studentId }: { studentId: string }) {
  const [homeworks, setHomeworks] = useState<HomeworkWithFiles[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('homeworks')
      .select('*, subject:subjects(name), files:homework_files(*)')
      .order('created_at', { ascending: false });
    setHomeworks((data as unknown as HomeworkWithFiles[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardSkeleton />;

  if (homeworks.length === 0) {
    return (
      <p className="fade-in rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
        Aucun devoir pour l&apos;instant. 🎉
      </p>
    );
  }

  return (
    <ul className="fade-in flex flex-col gap-3">
      {homeworks.map((hw) => (
        <li
          key={hw.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-semibold">
              {hw.subject?.name && (
                <span className="mb-1 mr-2 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  {hw.subject.name}
                </span>
              )}
              <MathText text={hw.description} />
            </p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge status={hw.status} />
              {hw.grade != null && (
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                  {hw.grade}/20
                </span>
              )}
            </div>
          </div>
          {hw.deadline && (
            <p className="mb-2 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              <Clock className="h-4 w-4" /> Pour le {fmtDate(hw.deadline)}
            </p>
          )}

          {/* Fichiers déjà envoyés */}
          {hw.files.length > 0 && (
            <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
              📎 {hw.files.length} fichier{hw.files.length > 1 ? 's' : ''} envoyé
              {hw.files.length > 1 ? 's' : ''} :{' '}
              {hw.files.map((f) => f.file_name).join(', ')}
            </p>
          )}

          {/* Correction du tuteur */}
          {hw.status === 'graded' && hw.feedback && (
            <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              <p className="font-bold">Correction du tuteur :</p>
              <MathText text={hw.feedback} />
            </div>
          )}

          {hw.status !== 'graded' && (
            <UploadButton hw={hw} studentId={studentId} onDone={load} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------
// Envoi de fichiers (plusieurs à la fois) : photos, PDF, docs.
// ------------------------------------------------------------
function UploadButton({
  hw,
  studentId,
  onDone,
}: {
  hw: HomeworkWithFiles;
  studentId: string;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    for (const file of files) {
      // Chemin imposé par la politique Storage : dossier = uid de l'élève
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${studentId}/${hw.id}-${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('homeworks')
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setError(`Échec de l'envoi de « ${file.name} » : ${uploadError.message}`);
        setUploading(false);
        return;
      }
      const { error: dbError } = await supabase.from('homework_files').insert({
        homework_id: hw.id,
        file_path: path,
        file_name: file.name,
      });
      if (dbError) {
        setError(`Fichier envoyé mais non enregistré : ${dbError.message}`);
        setUploading(false);
        return;
      }
    }

    await supabase.from('homeworks').update({ status: 'submitted' }).eq('id', hw.id);
    // Notifie le tuteur qui a donné le devoir (multi-tuteurs)
    sendPush({
      ...(hw.tutor_id ? { user_ids: [hw.tutor_id] } : { to: 'tutors' as const }),
      title: 'MathTutor Pro',
      body: 'Un élève a envoyé son devoir 📸',
      event: 'homework_submitted',
    });
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    onDone();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt"
        multiple
        className="hidden"
        onChange={handleFiles}
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
            ? 'Envoyer d’autres fichiers'
            : 'Envoyer photos / fichiers'}
      </button>
      {error && (
        <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
    </>
  );
}
