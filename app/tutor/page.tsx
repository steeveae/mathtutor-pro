'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  Clock,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Play,
  Receipt,
  Send,
  Square,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile, signOut } from '@/lib/useProfile';
import { fmtDate, fmtTime, fmtDuration, sessionMinutes } from '@/lib/format';

// ---------- Types ----------
type Student = { id: string; name: string };

type Session = {
  id: string;
  student_id: string;
  scheduled_time: string;
  start_time: string | null;
  end_time: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  live_content: string | null;
  student: { name: string } | null;
};

type Homework = {
  id: string;
  student_id: string;
  description: string;
  deadline: string | null;
  photo_url: string | null;
  feedback: string | null;
  status: 'pending' | 'submitted' | 'graded';
  created_at: string;
  student: { name: string } | null;
};

// ============================================================
// Page principale : 3 onglets (Sessions / Devoirs / Facturation)
// ============================================================
export default function TutorDashboard() {
  const router = useRouter();
  const profile = useProfile('tutor');
  const [tab, setTab] = useState<'sessions' | 'homeworks' | 'billing'>('sessions');

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-4 pb-10">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Bonjour {profile.name} 👋</h1>
          <p className="text-sm text-slate-500">Espace Tuteur</p>
        </div>
        <button
          onClick={() => signOut(router)}
          className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600 active:scale-95"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </header>

      {/* Onglets */}
      <nav className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-200 p-1">
        <button
          onClick={() => setTab('sessions')}
          className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition ${
            tab === 'sessions' ? 'bg-white text-indigo-700 shadow' : 'text-slate-600'
          }`}
        >
          <CalendarDays className="h-4 w-4" /> Sessions
        </button>
        <button
          onClick={() => setTab('homeworks')}
          className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition ${
            tab === 'homeworks' ? 'bg-white text-indigo-700 shadow' : 'text-slate-600'
          }`}
        >
          <BookOpen className="h-4 w-4" /> Devoirs
        </button>
        <button
          onClick={() => setTab('billing')}
          className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition ${
            tab === 'billing' ? 'bg-white text-indigo-700 shadow' : 'text-slate-600'
          }`}
        >
          <Receipt className="h-4 w-4" /> Facturation
        </button>
      </nav>

      {tab === 'sessions' && <SessionsTab tutorId={profile.id} />}
      {tab === 'homeworks' && <HomeworksTab />}
      {tab === 'billing' && <BillingTab />}
    </main>
  );
}

// ============================================================
// Onglet SESSIONS : planifier, démarrer, pousser du contenu,
// terminer, annuler.
// ============================================================
function SessionsTab({ tutorId }: { tutorId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Élèves (pour le formulaire de planification)
    const { data: studentRows } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'student')
      .order('name');
    setStudents(studentRows ?? []);

    // Sessions à venir ou en cours
    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('*, student:profiles!sessions_student_id_fkey(name)')
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_time');
    setSessions((sessionRows as unknown as Session[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- Actions sur une session ---
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

  if (loading) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-indigo-600" />;
  }

  const inProgress = sessions.filter((s) => s.status === 'in_progress');
  const upcoming = sessions.filter((s) => s.status === 'scheduled');

  return (
    <div className="flex flex-col gap-6">
      {/* Sessions en cours */}
      {inProgress.map((s) => (
        <LiveSessionCard key={s.id} session={s} onEnd={() => endSession(s.id)} />
      ))}

      {/* Planifier une session */}
      <NewSessionForm tutorId={tutorId} students={students} onCreated={load} />

      {/* Sessions à venir */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Sessions à venir</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucune session planifiée. Utilisez le formulaire ci-dessus.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{s.student?.name ?? 'Élève'}</p>
                  <p className="flex items-center gap-1 text-sm text-slate-500">
                    <Clock className="h-4 w-4" />
                    {fmtDate(s.scheduled_time)} à {fmtTime(s.scheduled_time)}
                  </p>
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
                    className="rounded-xl border border-slate-300 px-3 py-2 text-slate-500 active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------
// Carte "session en cours" : chrono + envoi de contenu en
// direct (l'élève le verra en temps réel à l'Étape 4).
// ------------------------------------------------------------
function LiveSessionCard({ session, onEnd }: { session: Session; onEnd: () => void }) {
  const [content, setContent] = useState(session.live_content ?? '');
  const [sent, setSent] = useState(false);

  async function pushContent() {
    await supabase
      .from('sessions')
      .update({ live_content: content })
      .eq('id', session.id);
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }

  return (
    <section className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 font-bold text-emerald-800">
            <span className="relative flex h-3 w-3">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            En cours — {session.student?.name ?? 'Élève'}
          </p>
          {session.start_time && (
            <p className="text-sm text-emerald-700">
              Démarrée à {fmtTime(session.start_time)}
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

      {/* Contenu de cours poussé en direct */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder={'Écrivez le contenu du cours ici…\nEx : Exercice 1 — Résoudre 2x + 5 = 13'}
        className="w-full rounded-xl border border-emerald-300 bg-white p-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
      />
      <button
        onClick={pushContent}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 sm:w-auto"
      >
        <Send className="h-4 w-4" />
        {sent ? 'Envoyé ✓' : "Envoyer à l'élève"}
      </button>
    </section>
  );
}

// ------------------------------------------------------------
// Formulaire de planification d'une nouvelle session
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { error: insertError } = await supabase.from('sessions').insert({
      tutor_id: tutorId,
      student_id: studentId,
      scheduled_time: new Date(when).toISOString(),
    });
    setSaving(false);
    if (insertError) {
      setError("Impossible de créer la session. Réessayez.");
      return;
    }
    setStudentId('');
    setWhen('');
    onCreated();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <CalendarPlus className="h-5 w-5 text-indigo-600" /> Planifier une session
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <select
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 sm:flex-1"
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
          className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 sm:flex-1"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Planifier
        </button>
      </form>
      {error && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

// ============================================================
// Onglet FACTURATION : total des heures réelles (start → end)
// des sessions terminées sur les 14 derniers jours.
// ============================================================
function BillingTab() {
  const [rows, setRows] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('sessions')
        .select('*, student:profiles!sessions_student_id_fkey(name)')
        .eq('status', 'completed')
        .gte('end_time', since)
        .order('end_time', { ascending: false });
      setRows((data as unknown as Session[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-indigo-600" />;
  }

  const totalMinutes = rows.reduce((sum, s) => sum + sessionMinutes(s), 0);

  // Sous-totaux par élève (utile pour justifier chaque facture)
  const byStudent = new Map<string, number>();
  for (const s of rows) {
    const name = s.student?.name ?? 'Élève';
    byStudent.set(name, (byStudent.get(name) ?? 0) + sessionMinutes(s));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Total 14 jours */}
      <section className="rounded-2xl bg-indigo-600 p-6 text-white shadow">
        <p className="text-sm uppercase tracking-wide opacity-80">
          Total des 14 derniers jours
        </p>
        <p className="text-4xl font-extrabold">{fmtDuration(totalMinutes)}</p>
        <p className="mt-1 text-sm opacity-80">
          {rows.length} session{rows.length > 1 ? 's' : ''} terminée
          {rows.length > 1 ? 's' : ''}
        </p>
      </section>

      {/* Sous-totaux par élève */}
      {byStudent.size > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Par élève</h2>
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {[...byStudent.entries()].map(([name, minutes]) => (
              <li
                key={name}
                className="flex items-center justify-between border-b border-slate-100 p-4 last:border-0"
              >
                <span className="font-medium">{name}</span>
                <span className="font-bold text-indigo-700">{fmtDuration(minutes)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Détail session par session */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Détail des sessions</h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucune session terminée sur les 14 derniers jours.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-medium">{s.student?.name ?? 'Élève'}</p>
                  <p className="text-sm text-slate-500">
                    {s.end_time && fmtDate(s.end_time)}
                    {s.start_time && s.end_time && (
                      <> · {fmtTime(s.start_time)} → {fmtTime(s.end_time)}</>
                    )}
                  </p>
                </div>
                <span className="font-bold text-indigo-700">
                  {fmtDuration(sessionMinutes(s))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Onglet DEVOIRS : donner un devoir, voir la photo envoyée
// par l'élève, écrire la correction.
// ============================================================
function HomeworksTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: studentRows } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'student')
      .order('name');
    setStudents(studentRows ?? []);

    const { data } = await supabase
      .from('homeworks')
      .select('*, student:profiles!homeworks_student_id_fkey(name)')
      .order('created_at', { ascending: false });
    setHomeworks((data as unknown as Homework[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <Loader2 className="mx-auto mt-12 h-8 w-8 animate-spin text-indigo-600" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <NewHomeworkForm students={students} onCreated={load} />

      <section>
        <h2 className="mb-3 text-lg font-bold">Devoirs donnés</h2>
        {homeworks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aucun devoir pour l&apos;instant. Utilisez le formulaire ci-dessus.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {homeworks.map((hw) => (
              <HomeworkCard key={hw.id} hw={hw} onChanged={load} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------
// Formulaire "Donner un devoir"
// ------------------------------------------------------------
function NewHomeworkForm({
  students,
  onCreated,
}: {
  students: Student[];
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { error: insertError } = await supabase.from('homeworks').insert({
      student_id: studentId,
      description: description.trim(),
      deadline: deadline ? new Date(`${deadline}T23:59:00`).toISOString() : null,
    });
    setSaving(false);
    if (insertError) {
      setError('Impossible de créer le devoir. Réessayez.');
      return;
    }
    setStudentId('');
    setDescription('');
    setDeadline('');
    onCreated();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <BookOpen className="h-5 w-5 text-indigo-600" /> Donner un devoir
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            required
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 sm:flex-1"
          >
            <option value="">Choisir un élève…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-600 sm:flex-1">
            Pour le
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="flex-1 bg-transparent outline-none"
            />
          </label>
        </div>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Ex : Faire les exercices 3 et 4 page 52 (équations du 1er degré)"
          className="w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500"
        />
        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white active:scale-95 disabled:opacity-60 sm:self-end"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Donner le devoir
        </button>
      </form>
    </section>
  );
}

// ------------------------------------------------------------
// Carte d'un devoir : statut, photo de l'élève (lien signé,
// le bucket est privé) et zone de correction.
// ------------------------------------------------------------
function HomeworkCard({ hw, onChanged }: { hw: Homework; onChanged: () => void }) {
  const [feedback, setFeedback] = useState(hw.feedback ?? '');
  const [busy, setBusy] = useState(false);

  const badge = {
    pending: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
    submitted: { label: 'Photo reçue', cls: 'bg-blue-100 text-blue-800' },
    graded: { label: 'Corrigé', cls: 'bg-emerald-100 text-emerald-800' },
  }[hw.status];

  async function viewPhoto() {
    if (!hw.photo_url) return;
    // URL signée valable 1 h : le bucket Storage est privé
    const { data } = await supabase.storage
      .from('homeworks')
      .createSignedUrl(hw.photo_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function sendFeedback() {
    setBusy(true);
    await supabase
      .from('homeworks')
      .update({ feedback: feedback.trim(), status: 'graded' })
      .eq('id', hw.id);
    setBusy(false);
    onChanged();
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-semibold">{hw.student?.name ?? 'Élève'}</p>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-sm text-slate-700">{hw.description}</p>
      {hw.deadline && (
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
          <Clock className="h-4 w-4" /> Pour le {fmtDate(hw.deadline)}
        </p>
      )}

      {hw.photo_url && (
        <button
          onClick={viewPhoto}
          className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 active:scale-95"
        >
          <ImageIcon className="h-4 w-4" /> Voir la photo de l&apos;élève
        </button>
      )}

      {/* Correction (modifiable même après envoi) */}
      {hw.status !== 'pending' && (
        <div className="mt-3">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="Écrire la correction / remarque pour l'élève…"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-indigo-500"
          />
          <button
            onClick={sendFeedback}
            disabled={busy || feedback.trim() === ''}
            className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer la correction
          </button>
        </div>
      )}
    </li>
  );
}
