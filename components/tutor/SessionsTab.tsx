'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarPlus,
  Clock,
  Loader2,
  MessageCircle,
  NotebookPen,
  Play,
  Send,
  Square,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtDate, fmtTime, fmtDuration, sessionMinutes } from '@/lib/format';
import type { Session, SessionMessage } from '@/lib/types';
import { Avatar, CardSkeleton, Elapsed, MathText } from '@/components/ui';

type Student = { id: string; name: string };

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800';

export default function SessionsTab({ tutorId }: { tutorId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [recent, setRecent] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: studentRows } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'student')
      .order('name');
    setStudents(studentRows ?? []);

    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('*, student:profiles!sessions_student_id_fkey(name)')
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_time');
    setSessions((sessionRows as unknown as Session[]) ?? []);

    // Sessions terminées récemment → pour le compte rendu (notes)
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data: recentRows } = await supabase
      .from('sessions')
      .select('*, student:profiles!sessions_student_id_fkey(name)')
      .eq('status', 'completed')
      .gte('end_time', since)
      .order('end_time', { ascending: false })
      .limit(8);
    setRecent((recentRows as unknown as Session[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startSession(id: string) {
    await supabase
      .from('sessions')
      .update({ status: 'in_progress', start_time: new Date().toISOString() })
      .eq('id', id);
    load();
  }

  async function endSession(id: string) {
    await supabase
      .from('sessions')
      .update({ status: 'completed', end_time: new Date().toISOString() })
      .eq('id', id);
    load();
  }

  async function cancelSession(id: string) {
    await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', id);
    load();
  }

  if (loading) return <CardSkeleton />;

  const inProgress = sessions.filter((s) => s.status === 'in_progress');
  const upcoming = sessions.filter((s) => s.status === 'scheduled');

  return (
    <div className="fade-in flex flex-col gap-6">
      {inProgress.map((s) => (
        <LiveSessionCard key={s.id} session={s} tutorId={tutorId} onEnd={() => endSession(s.id)} />
      ))}

      <NewSessionForm tutorId={tutorId} students={students} onCreated={load} />

      <section>
        <h2 className="mb-3 text-lg font-bold">Sessions à venir</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Aucune session planifiée. Utilisez le formulaire ci-dessus.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={s.student?.name ?? '?'} />
                  <div>
                    <p className="font-semibold">{s.student?.name ?? 'Élève'}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                      <Clock className="h-4 w-4" />
                      {fmtDate(s.scheduled_time)} à {fmtTime(s.scheduled_time)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startSession(s.id)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 sm:flex-none"
                  >
                    <Play className="h-4 w-4" /> Démarrer
                  </button>
                  <button
                    onClick={() => cancelSession(s.id)}
                    title="Annuler la session"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-slate-500 active:scale-95 dark:border-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Comptes rendus des sessions terminées */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <NotebookPen className="h-5 w-5 text-indigo-600" /> Comptes rendus récents
          </h2>
          <ul className="flex flex-col gap-3">
            {recent.map((s) => (
              <SessionNoteCard key={s.id} session={s} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Carte session en cours : chrono en direct, envoi de slides
// (avec aperçu des formules) et questions de l'élève en direct.
// ------------------------------------------------------------
function LiveSessionCard({
  session,
  tutorId,
  onEnd,
}: {
  session: Session;
  tutorId: string;
  onEnd: () => void;
}) {
  const [content, setContent] = useState(session.live_content ?? '');
  const [sent, setSent] = useState(false);
  const [messages, setMessages] = useState<SessionMessage[]>([]);

  // Questions de l'élève en temps réel
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
      .channel(`tutor-messages-${session.id}`)
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

  async function pushContent() {
    await supabase.from('sessions').update({ live_content: content }).eq('id', session.id);
    // Historique des slides (l'élève pourra réviser plus tard)
    if (content.trim()) {
      await supabase.from('slides').insert({ session_id: session.id, content: content.trim() });
    }
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }

  return (
    <section className="fade-in rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 dark:bg-emerald-950/40">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
            <span className="relative flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            En cours — {session.student?.name ?? 'Élève'}
          </p>
          {session.start_time && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              ⏱ <Elapsed since={session.start_time} /> (démarrée à {fmtTime(session.start_time)})
            </p>
          )}
        </div>
        <button
          onClick={onEnd}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          <Square className="h-4 w-4" /> Terminer
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder={
          'Écrivez le contenu du cours ici…\nAstuce : mettez les formules entre $ — ex : $2x + 5 = 13$ ou $$\\frac{a}{b}$$'
        }
        className="w-full rounded-xl border border-emerald-300 bg-white p-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-emerald-700 dark:bg-slate-800"
      />

      {/* Aperçu du rendu mathématique avant envoi */}
      {content.includes('$') && (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-white p-3 text-sm dark:border-emerald-800 dark:bg-slate-800">
          <p className="mb-1 text-xs font-bold uppercase text-slate-400">Aperçu élève</p>
          <MathText text={content} />
        </div>
      )}

      <button
        onClick={pushContent}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 sm:w-auto"
      >
        <Send className="h-4 w-4" />
        {sent ? 'Envoyé ✓' : "Envoyer à l'élève"}
      </button>

      {/* Questions / réponses de l'élève */}
      {messages.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-3 dark:bg-slate-800">
          <p className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300">
            <MessageCircle className="h-4 w-4" /> Messages de l&apos;élève
          </p>
          <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto text-sm">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.sender_id === tutorId
                    ? 'text-slate-400'
                    : 'font-medium text-slate-800 dark:text-slate-100'
                }
              >
                <span className="mr-2 text-xs text-slate-400">{fmtTime(m.created_at)}</span>
                <MathText text={m.content} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Formulaire de planification (avec répétition hebdomadaire)
// ------------------------------------------------------------
function NewSessionForm({
  tutorId,
  students,
  onCreated,
}: {
  tutorId: string;
  students: Student[];
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [when, setWhen] = useState('');
  const [repeat, setRepeat] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const base = new Date(when).getTime();
    // 1 ligne par semaine (sessions récurrentes)
    const rows = Array.from({ length: repeat }, (_, i) => ({
      tutor_id: tutorId,
      student_id: studentId,
      scheduled_time: new Date(base + i * 7 * 24 * 3600 * 1000).toISOString(),
    }));
    const { error: insertError } = await supabase.from('sessions').insert(rows);
    setSaving(false);
    if (insertError) {
      setError('Impossible de créer la session. Réessayez.');
      return;
    }
    setStudentId('');
    setWhen('');
    setRepeat(1);
    onCreated();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <CalendarPlus className="h-5 w-5 text-indigo-600" /> Planifier une session
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            required
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className={`${inputCls} sm:flex-1`}
          >
            <option value="">Choisir un élève…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            required
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={`${inputCls} sm:flex-1`}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={repeat}
            onChange={(e) => setRepeat(Number(e.target.value))}
            className={`${inputCls} sm:flex-1`}
          >
            <option value={1}>Une seule fois</option>
            <option value={4}>Chaque semaine × 4</option>
            <option value={8}>Chaque semaine × 8</option>
            <option value={12}>Chaque semaine × 12</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            Planifier
          </button>
        </div>
      </form>
      {error && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

// ------------------------------------------------------------
// Compte rendu d'une session terminée (notes visibles par
// l'élève et le parent)
// ------------------------------------------------------------
function SessionNoteCard({ session }: { session: Session }) {
  const [notes, setNotes] = useState(session.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from('sessions').update({ notes: notes.trim() }).eq('id', session.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar name={session.student?.name ?? '?'} size="sm" />
          <div>
            <p className="text-sm font-semibold">{session.student?.name ?? 'Élève'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {session.end_time && fmtDate(session.end_time)} ·{' '}
              {fmtDuration(sessionMinutes(session))}
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Compte rendu : chapitre vu, points à revoir…"
          className="flex-1 rounded-xl border border-slate-300 bg-white p-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saved ? '✓' : 'Enregistrer'}
        </button>
      </div>
    </li>
  );
}
