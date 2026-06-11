'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtShortDate } from '@/lib/format';
import type { Homework, Profile } from '@/lib/types';
import { Avatar, CardSkeleton } from '@/components/ui';

// Onglet ÉLÈVES : tarif horaire, lien avec un compte parent,
// et progression (notes des devoirs corrigés).
export default function StudentsTab() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [parents, setParents] = useState<Profile[]>([]);
  const [grades, setGrades] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, role, name, email, hourly_rate, linked_parent_id')
      .order('name');
    const all = (profileRows as Profile[]) ?? [];
    setStudents(all.filter((p) => p.role === 'student'));
    setParents(all.filter((p) => p.role === 'parent'));

    const { data: gradeRows } = await supabase
      .from('homeworks')
      .select('id, student_id, description, deadline, photo_url, feedback, grade, status, created_at')
      .eq('status', 'graded')
      .not('grade', 'is', null)
      .order('created_at');
    setGrades((gradeRows as Homework[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CardSkeleton />;

  if (students.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
        Aucun élève. Créez leurs comptes dans Supabase (Authentication → Add user).
      </p>
    );
  }

  return (
    <div className="fade-in flex flex-col gap-4">
      {students.map((s) => (
        <StudentCard
          key={s.id}
          student={s}
          parents={parents}
          grades={grades.filter((g) => g.student_id === s.id)}
          onChanged={load}
        />
      ))}
    </div>
  );
}

function StudentCard({
  student,
  parents,
  grades,
  onChanged,
}: {
  student: Profile;
  parents: Profile[];
  grades: Homework[];
  onChanged: () => void;
}) {
  const [rate, setRate] = useState(student.hourly_rate.toString());
  const [saved, setSaved] = useState(false);

  async function saveRate() {
    await supabase
      .from('profiles')
      .update({ hourly_rate: Number(rate) || 0 })
      .eq('id', student.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onChanged();
  }

  async function linkParent(parentId: string) {
    await supabase
      .from('profiles')
      .update({ linked_parent_id: parentId || null })
      .eq('id', student.id);
    onChanged();
  }

  const average =
    grades.length > 0
      ? grades.reduce((sum, g) => sum + (g.grade ?? 0), 0) / grades.length
      : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={student.name} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{student.name}</p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{student.email}</p>
        </div>
        {average != null && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
            Moy. {average.toFixed(1)}/20
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Tarif horaire (utilisé par la facturation) */}
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
          Tarif
          <input
            type="number"
            min={0}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-24 bg-transparent text-right font-bold outline-none"
          />
          FCFA/h
          <button
            onClick={saveRate}
            className="ml-auto rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white active:scale-95"
          >
            {saved ? '✓' : 'OK'}
          </button>
        </label>

        {/* Lien avec un compte parent */}
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
          <Users className="h-4 w-4 shrink-0 text-slate-400" />
          <select
            value={student.linked_parent_id ?? ''}
            onChange={(e) => linkParent(e.target.value)}
            className="w-full bg-transparent outline-none"
          >
            <option value="">Aucun parent lié</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Progression : notes des devoirs corrigés */}
      {grades.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase text-slate-400">
            <TrendingUp className="h-4 w-4" /> Progression ({grades.length} devoir
            {grades.length > 1 ? 's' : ''} noté{grades.length > 1 ? 's' : ''})
          </p>
          <div className="flex h-20 items-end gap-1">
            {grades.slice(-12).map((g) => (
              <div key={g.id} className="flex flex-1 flex-col items-center gap-1" title={g.description}>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {g.grade}
                </span>
                <div
                  className={`w-full rounded-t ${
                    (g.grade ?? 0) >= 10 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ height: `${Math.max(6, ((g.grade ?? 0) / 20) * 56)}px` }}
                />
                <span className="text-[9px] text-slate-400">{fmtShortDate(g.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
