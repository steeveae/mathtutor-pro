'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import {
  fmtDuration,
  fmtMoney,
  fmtShortDate,
  fmtTime,
  sessionAmount,
  sessionMinutes,
} from '@/lib/format';
import type { Session } from '@/lib/types';
import { CardSkeleton } from '@/components/ui';

type Row = Session & { student: { name: string } | null };
type Rate = { id: string; name: string; hourly_rate: number };

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Facture imprimable : période + élève au choix, puis
// bouton Imprimer → "Enregistrer en PDF" dans le navigateur.
export default function InvoicePage() {
  const profile = useProfile('tutor');
  const [from, setFrom] = useState(() =>
    toInputDate(new Date(Date.now() - 14 * 24 * 3600 * 1000))
  );
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [studentId, setStudentId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [students, setStudents] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    async function load() {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      let query = supabase
        .from('sessions')
        .select(
          '*, student:profiles!sessions_student_id_fkey(name), subject:subjects(name, hourly_rate)'
        )
        .eq('status', 'completed')
        .gte('end_time', start)
        .lte('end_time', end)
        .order('end_time');
      if (studentId) query = query.eq('student_id', studentId);

      const [{ data: sessionRows }, { data: rateRows }] = await Promise.all([
        query,
        supabase.from('profiles').select('id, name, hourly_rate').eq('role', 'student'),
      ]);
      setRows((sessionRows as unknown as Row[]) ?? []);
      setStudents((rateRows as Rate[]) ?? []);
      setLoading(false);
    }
    load();
  }, [profile, from, to, studentId]);

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <CardSkeleton />
      </main>
    );
  }

  // Tarif appliqué : celui de la matière s'il existe, sinon celui de l'élève
  const rateOf = (s: Row) =>
    s.subject?.hourly_rate ?? students.find((p) => p.id === s.student_id)?.hourly_rate ?? 0;
  const totalMinutes = rows.reduce((sum, s) => sum + sessionMinutes(s), 0);
  const totalAmount = rows.reduce((sum, s) => sum + sessionAmount(s, rateOf(s)), 0);

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-4">
      {/* Contrôles (masqués à l'impression) */}
      <div className="no-print mb-4 flex flex-col gap-3">
        <Link
          href="/tutor"
          className="flex w-fit items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400"
        >
          <ArrowLeft className="h-4 w-4" /> Retour au dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Tous les élèves</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <span className="text-sm text-slate-500">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            onClick={() => window.print()}
            className="ml-auto flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
          >
            <Printer className="h-4 w-4" /> Imprimer / PDF
          </button>
        </div>
      </div>

      {/* Facture */}
      <div className="print-area rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-indigo-700">MathTutor Pro</h1>
            <p className="text-sm text-slate-500">{profile.name} — Cours de mathématiques</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p className="font-bold text-slate-700">Relevé d&apos;heures</p>
            <p>
              Du {fmtShortDate(new Date(`${from}T00:00:00`).toISOString())} au{' '}
              {fmtShortDate(new Date(`${to}T00:00:00`).toISOString())}
            </p>
          </div>
        </header>

        {loading ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-slate-500">
            Aucune session terminée sur cette période.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left text-slate-500">
                  <th className="py-2">Date</th>
                  <th className="py-2">Élève</th>
                  <th className="py-2">Horaires</th>
                  <th className="py-2 text-right">Durée</th>
                  <th className="py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2">{s.end_time && fmtShortDate(s.end_time)}</td>
                    <td className="py-2">
                      {s.student?.name ?? 'Élève'}
                      {s.subject?.name && (
                        <span className="block text-xs text-slate-400">{s.subject.name}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {s.start_time && s.end_time && (
                        <>
                          {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                        </>
                      )}
                    </td>
                    <td className="py-2 text-right">{fmtDuration(sessionMinutes(s))}</td>
                    <td className="py-2 text-right">
                      {fmtMoney(sessionAmount(s, rateOf(s)))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={3} className="py-3">
                    Total ({rows.length} session{rows.length > 1 ? 's' : ''})
                  </td>
                  <td className="py-3 text-right">{fmtDuration(totalMinutes)}</td>
                  <td className="py-3 text-right text-indigo-700">{fmtMoney(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-6 text-xs text-slate-400">
              Durées calculées sur les horaires réels de début et de fin de chaque session.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
