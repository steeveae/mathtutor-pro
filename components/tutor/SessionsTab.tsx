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
  Users,
  Video,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { sendPush } from '@/lib/notify';
import { fmtDate, fmtTime, fmtDuration, sessionMinutes } from '@/lib/format';
import type { Session, SessionMessage } from '@/lib/types';
import { Avatar, CardSkeleton, Elapsed, MathText } from '@/components/ui';

type Student = { id: string; name: string };

// Un "groupe" = un cours : 1 session par élève, reliées par group_key
// (les cours individuels sont des groupes d'une seule session).
type SessionGroup = { key: string; sessions: Session[] };

function groupSessions(list: Session[]): SessionGroup[] {
  const map = new Map<string, Session[]>();
  for (const s of list) {
    const k = s.group_key ?? s.id;
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return [...map.entries()].map(([key, sessions]) => ({ key, sessions }));
}

// Nom de salle visio Jitsi, partagé tuteur/élèves via le group_key
export function meetRoom(key: string) {
  return `mtp-${key.replace(/-/g, '')}`;
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800';

export default function SessionsTab({
  tutorId,
  tutorName,
}: {
  tutorId: string;
  tutorName: string;
}) {
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

  // Les actions s'appliquent à toutes les sessions du groupe
  async function startGroup(group: SessionGroup) {
    const ids = group.sessions.map((s) => s.id);
    await supabase
      .from('sessions')
      .update({ status: 'in_progress', start_time: new Date().toISOString() })
      .in('id', ids);
    // Push aux élèves, même app fermée
    sendPush({
      user_ids: group.sessions.map((s) => s.student_id),
      title: 'MathTutor Pro',
      body: 'Ton cours commence ! Rejoins la session 🎓',
    });
    load();
  }

  async function endGroup(ids: string[]) {
    await supabase
      .from('sessions')
      .update({ status: 'completed', end_time: new Date().toISOString() })
      .in('id', ids);
    load();
  }

  async function cancelGroup(ids: string[]) {
    await supabase.from('sessions').update({ status: 'cancelled' }).in('id', ids);
    load();
  }

  if (loading) return <CardSkeleton />;

  const inProgress = groupSessions(sessions.filter((s) => s.status === 'in_progress'));
  const upcoming = groupSessions(sessions.filter((s) => s.status === 'scheduled'));

  return (
    <div className="fade-in flex flex-col gap-6">
      {inProgress.map((g) => (
        <LiveSessionCard
          key={g.key}
          group={g}
          tutorId={tutorId}
          tutorName={tutorName}
          onEnd={() => endGroup(g.sessions.map((s) => s.id))}
        />
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
            {upcoming.map((g) => {
              const first = g.sessions[0];
              const ids = g.sessions.map((s) => s.id);
              const collective = g.sessions.length > 1;
              return (
                <li
                  key={g.key}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {collective ? (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white">
                        <Users className="h-5 w-5" />
                      </span>
                    ) : (
                      <Avatar name={first.student?.name ?? '?'} />
                    )}
                    <div>
                      <p className="font-semibold">
                        {collective
                          ? `Cours collectif — ${g.sessions.length} élèves`
                          : first.student?.name ?? 'Élève'}
                      </p>
                      {collective && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {g.sessions.map((s) => s.student?.name ?? '?').join(', ')}
                        </p>
                      )}
                      <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <Clock className="h-4 w-4" />
                        {fmtDate(first.scheduled_time)} à {fmtTime(first.scheduled_time)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startGroup(g)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 sm:flex-none"
                    >
                      <Play className="h-4 w-4" /> Démarrer
                    </button>
                    <button
                      onClick={() => cancelGroup(ids)}
                      title="Annuler la session"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-500 active:scale-95 dark:border-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
// Carte cours en cours (individuel ou collectif) : chrono,
// slides avec aperçu, visio Jitsi intégrée, messages des élèves.
// ------------------------------------------------------------
function LiveSessionCard({
  group,
  tutorId,
  tutorName,
  onEnd,
}: {
  group: SessionGroup;
  tutorId: string;
  tutorName: string;
  onEnd: () => void;
}) {
  const first = group.sessions[0];
  const ids = group.sessions.map((s) => s.id);
  const collective = group.sessions.length > 1;
  const [content, setContent] = useState(first.live_content ?? '');
  const [sent, setSent] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [messages, setMessages] = useState<(SessionMessage & { sender: { name: string } | null })[]>([]);

  useEffect(() => {
    let active = true;
    async function loadMessages() {
      const { data } = await supabase
        .from('session_messages')
        .select('*, sender:profiles!session_messages_sender_id_fkey(name)')
        .in('session_id', ids)
        .order('created_at');
      if (active)
        setMessages(
          (data as unknown as (SessionMessage & { sender: { name: string } | null })[]) ?? []
        );
    }
    loadMessages();
    const channel = supabase
      .channel(`tutor-messages-${group.key}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_messages' },
        (payload) => {
          const row = payload.new as { session_id?: string };
          if (row.session_id && ids.includes(row.session_id)) loadMessages();
        }
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.key]);

  async function pushContent() {
    await supabase.from('sessions').update({ live_content: content }).in('id', ids);
    if (content.trim()) {
      // Une entrée d'historique par élève du cours
      await supabase
        .from('slides')
        .insert(ids.map((sessionId) => ({ session_id: sessionId, content: content.trim() })));
    }
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }

  const room = meetRoom(group.key);

  return (
    <section className="fade-in rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 dark:bg-emerald-950/40">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
            <span className="relative flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            En cours —{' '}
            {collective
              ? `Cours collectif (${group.sessions.length} élèves)`
              : first.student?.name ?? 'Élève'}
          </p>
          {collective && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {group.sessions.map((s) => s.student?.name ?? '?').join(', ')}
            </p>
          )}
          {first.start_time && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              ⏱ <Elapsed since={first.start_time} /> (démarrée à {fmtTime(first.start_time)})
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

      {/* Visio audio/vidéo intégrée (Jitsi Meet, gratuite) */}
      <button
        onClick={() => setShowCall(!showCall)}
        className={`mb-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold active:scale-95 sm:w-auto ${
          showCall
            ? 'border border-emerald-400 text-emerald-700 dark:text-emerald-300'
            : 'bg-emerald-600 text-white'
        }`}
      >
        <Video className="h-4 w-4" />
        {showCall ? "Masquer l'appel" : "Démarrer l'appel audio/vidéo"}
      </button>
      {showCall && (
        <iframe
          src={`https://meet.jit.si/${room}#userInfo.displayName=%22${encodeURIComponent(tutorName)}%22`}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="mb-3 h-96 w-full rounded-xl border-0 bg-black"
        />
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder={
          'Écrivez le contenu du cours ici…\nAstuce : mettez les formules entre $ — ex : $2x + 5 = 13$ ou $$\\frac{a}{b}$$'
        }
        className="w-full rounded-xl border border-emerald-300 bg-white p-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-emerald-700 dark:bg-slate-800"
      />

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
        {sent ? 'Envoyé ✓' : collective ? 'Envoyer à tous les élèves' : "Envoyer à l'élève"}
      </button>

      {messages.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-3 dark:bg-slate-800">
          <p className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300">
            <MessageCircle className="h-4 w-4" /> Messages des élèves
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
                {m.sender_id !== tutorId && (
                  <span className="mr-1 font-bold text-indigo-600 dark:text-indigo-400">
                    {m.sender?.name ?? 'Élève'} :
                  </span>
                )}
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
// Formulaire de planification : élève précis OU tous les
// élèves (cours collectif), avec répétition hebdomadaire.
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
    const targets = studentId === '__all__' ? students.map((s) => s.id) : [studentId];

    // 1 occurrence par semaine ; pour un cours collectif, toutes les
    // sessions d'une même occurrence partagent un group_key.
    const rows = Array.from({ length: repeat }, (_, week) => {
      const groupKey = targets.length > 1 ? crypto.randomUUID() : null;
      return targets.map((sid) => ({
        tutor_id: tutorId,
        student_id: sid,
        scheduled_time: new Date(base + week * 7 * 24 * 3600 * 1000).toISOString(),
        group_key: groupKey,
      }));
    }).flat();

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
            <option value="__all__">👥 Tous les élèves (cours collectif)</option>
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
// Compte rendu d'une session terminée
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
