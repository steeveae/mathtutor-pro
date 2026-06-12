'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Clock, FileText, Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { sendPush } from '@/lib/notify';
import { fmtDate } from '@/lib/format';
import type { Homework, HomeworkFile, Subject } from '@/lib/types';
import { Avatar, CardSkeleton, MathText, StatusBadge } from '@/components/ui';

type Student = { id: string; name: string };
type HomeworkWithFiles = Homework & { files: HomeworkFile[] };

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white p-3 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800';

export default function HomeworksTab({ tutorId }: { tutorId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [homeworks, setHomeworks] = useState<HomeworkWithFiles[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: studentRows } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'student')
      .order('name');
    setStudents(studentRows ?? []);

    const { data: subjectRows } = await supabase
      .from('subjects')
      .select('*')
      .eq('tutor_id', tutorId)
      .order('name');
    setSubjects((subjectRows as Subject[]) ?? []);

    const { data } = await supabase
      .from('homeworks')
      .select(
        '*, student:profiles!homeworks_student_id_fkey(name), subject:subjects(name), files:homework_files(*)'
      )
      .order('created_at', { ascending: false });
    setHomeworks((data as unknown as HomeworkWithFiles[]) ?? []);
    setLoading(false);
  }, [tutorId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardSkeleton />;

  return (
    <div className="fade-in flex flex-col gap-6">
      <NewHomeworkForm tutorId={tutorId} students={students} subjects={subjects} onCreated={load} />

      <section>
        <h2 className="mb-3 text-lg font-bold">Devoirs donnés</h2>
        {homeworks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
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

function NewHomeworkForm({
  tutorId,
  students,
  subjects,
  onCreated,
}: {
  tutorId: string;
  students: Student[];
  subjects: Subject[];
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // "Tous les élèves" → un devoir par élève (suivi individuel)
    const targets = studentId === '__all__' ? students.map((s) => s.id) : [studentId];
    const { error: insertError } = await supabase.from('homeworks').insert(
      targets.map((sid) => ({
        student_id: sid,
        tutor_id: tutorId,
        subject_id: subjectId || null,
        description: description.trim(),
        deadline: deadline ? new Date(`${deadline}T23:59:00`).toISOString() : null,
      }))
    );
    setSaving(false);
    if (insertError) {
      setError('Impossible de créer le devoir. Réessayez.');
      return;
    }
    sendPush({
      user_ids: targets,
      title: 'MathTutor Pro',
      body: 'Nouveau devoir à faire 📚',
      event: 'homework_new',
    });
    setStudentId('');
    setSubjectId('');
    setDescription('');
    setDeadline('');
    onCreated();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <BookOpen className="h-5 w-5 text-indigo-600" /> Donner un devoir
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
            <option value="__all__">👥 Tous les élèves</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:flex-1">
            Pour le
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="flex-1 bg-transparent outline-none"
            />
          </label>
        </div>
        {subjects.length > 0 && (
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className={inputCls}
          >
            <option value="">Matière (optionnel)…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Ex : Faire les exercices 3 et 4 page 52 — résoudre $3x - 7 = 8$"
          className={inputCls}
        />
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
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
// Carte d'un devoir : fichiers reçus (liens signés), note /20
// et correction.
// ------------------------------------------------------------
function HomeworkCard({ hw, onChanged }: { hw: HomeworkWithFiles; onChanged: () => void }) {
  const [feedback, setFeedback] = useState(hw.feedback ?? '');
  const [grade, setGrade] = useState<string>(hw.grade?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  async function openFile(path: string) {
    // URL signée valable 1 h : le bucket Storage est privé
    const { data } = await supabase.storage.from('homeworks').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function sendFeedback() {
    setBusy(true);
    await supabase
      .from('homeworks')
      .update({
        feedback: feedback.trim(),
        grade: grade === '' ? null : Number(grade),
        status: 'graded',
      })
      .eq('id', hw.id);
    sendPush({
      user_ids: [hw.student_id],
      title: 'MathTutor Pro',
      body: 'Ton devoir a été corrigé ✅',
      event: 'homework_graded',
    });
    setBusy(false);
    onChanged();
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar name={hw.student?.name ?? '?'} size="sm" />
          <p className="font-semibold">{hw.student?.name ?? 'Élève'}</p>
        </div>
        <div className="flex items-center gap-2">
          {hw.grade != null && (
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
              {hw.grade}/20
            </span>
          )}
          <StatusBadge status={hw.status} />
        </div>
      </div>
      {hw.subject?.name && (
        <span className="mb-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
          {hw.subject.name}
        </span>
      )}
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <MathText text={hw.description} />
      </p>
      {hw.deadline && (
        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
          <Clock className="h-4 w-4" /> Pour le {fmtDate(hw.deadline)}
        </p>
      )}

      {/* Fichiers envoyés par l'élève */}
      {(hw.files.length > 0 || hw.photo_url) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hw.photo_url && (
            <button
              onClick={() => openFile(hw.photo_url!)}
              className="flex items-center gap-2 rounded-xl border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 active:scale-95 dark:border-indigo-700 dark:text-indigo-300"
            >
              <FileText className="h-4 w-4" /> Photo
            </button>
          )}
          {hw.files.map((f) => (
            <button
              key={f.id}
              onClick={() => openFile(f.file_path)}
              className="flex items-center gap-2 rounded-xl border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 active:scale-95 dark:border-indigo-700 dark:text-indigo-300"
            >
              <FileText className="h-4 w-4" /> {f.file_name}
            </button>
          ))}
        </div>
      )}

      {/* Note + correction */}
      {hw.status !== 'pending' && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="Correction / remarque pour l'élève… (les formules entre $ sont rendues)"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
              Note
              <input
                type="number"
                min={0}
                max={20}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-14 bg-transparent text-center font-bold outline-none"
              />
              /20
            </label>
            <button
              onClick={sendFeedback}
              disabled={busy || feedback.trim() === ''}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer la correction
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
