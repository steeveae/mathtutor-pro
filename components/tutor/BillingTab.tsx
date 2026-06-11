'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  fmtDate,
  fmtDuration,
  fmtMoney,
  fmtShortDate,
  fmtTime,
  sessionAmount,
  sessionMinutes,
} from '@/lib/format';
import type { Session } from '@/lib/types';
import { Avatar, CardSkeleton } from '@/components/ui';

type Row = Session & { student: { name: string } | null };
type Rate = { id: string; name: string; hourly_rate: number };

// Onglet FACTURATION : heures réelles + montants (tarif × durée)
// sur les 14 derniers jours, avec graphique par jour.
export default function BillingTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [rates, setRates] = useState<Map<string, Rate>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const [{ data: sessionRows }, { data: rateRows }] = await Promise.all([
        supabase
          .from('sessions')
          .select(
            '*, student:profiles!sessions_student_id_fkey(name), subject:subjects(name, hourly_rate)'
          )
          .eq('status', 'completed')
          .gte('end_time', since)
          .order('end_time', { ascending: false }),
        supabase.from('profiles').select('id, name, hourly_rate').eq('role', 'student'),
      ]);
      setRows((sessionRows as unknown as Row[]) ?? []);
      setRates(new Map(((rateRows as Rate[]) ?? []).map((r) => [r.id, r])));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <CardSkeleton />;

  // Tarif appliqué : celui de la matière s'il existe, sinon celui de l'élève
  const rateOf = (s: Row) =>
    s.subject?.hourly_rate ?? rates.get(s.student_id)?.hourly_rate ?? 0;
  const totalMinutes = rows.reduce((sum, s) => sum + sessionMinutes(s), 0);
  const totalAmount = rows.reduce((sum, s) => sum + sessionAmount(s, rateOf(s)), 0);

  // Sous-totaux par élève (toujours affichés, base de chaque facture)
  const byStudent = new Map<string, { minutes: number; amount: number }>();
  for (const s of rows) {
    const name = s.student?.name ?? 'Élève';
    const cur = byStudent.get(name) ?? { minutes: 0, amount: 0 };
    cur.minutes += sessionMinutes(s);
    cur.amount += sessionAmount(s, rateOf(s));
    byStudent.set(name, cur);
  }

  // Sous-totaux par matière (suivi des gains par activité)
  const bySubject = new Map<string, { minutes: number; amount: number }>();
  for (const s of rows) {
    const name = s.subject?.name ?? 'Sans matière';
    const cur = bySubject.get(name) ?? { minutes: 0, amount: 0 };
    cur.minutes += sessionMinutes(s);
    cur.amount += sessionAmount(s, rateOf(s));
    bySubject.set(name, cur);
  }

  // Graphique : minutes par jour sur les 14 derniers jours
  const days: { label: string; minutes: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day.getTime() + 24 * 3600 * 1000);
    const minutes = rows
      .filter((s) => {
        const end = s.end_time ? new Date(s.end_time) : null;
        return end && end >= day && end < next;
      })
      .reduce((sum, s) => sum + sessionMinutes(s), 0);
    days.push({ label: fmtShortDate(day.toISOString()), minutes });
  }
  const maxDay = Math.max(60, ...days.map((d) => d.minutes));

  return (
    <div className="fade-in flex flex-col gap-6">
      {/* Totaux */}
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow">
        <p className="text-sm uppercase tracking-wide opacity-80">Total des 14 derniers jours</p>
        <p className="text-4xl font-extrabold">{fmtDuration(totalMinutes)}</p>
        <p className="mt-1 text-2xl font-bold opacity-95">{fmtMoney(totalAmount)}</p>
        <p className="mt-1 text-sm opacity-80">
          {rows.length} session{rows.length > 1 ? 's' : ''} terminée{rows.length > 1 ? 's' : ''}
        </p>
        <Link
          href="/tutor/invoice"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur active:scale-95"
        >
          <Printer className="h-4 w-4" /> Facture imprimable (PDF)
        </Link>
      </section>

      {/* Graphique heures par jour */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-lg font-bold">Heures par jour</h2>
        <div className="flex h-32 items-end gap-1">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t ${d.minutes > 0 ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                style={{ height: `${Math.max(4, (d.minutes / maxDay) * 96)}px` }}
                title={`${d.label} : ${fmtDuration(d.minutes)}`}
              />
              <span className="rotate-0 text-[9px] text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Sous-totaux par élève */}
      {byStudent.size > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Par élève</h2>
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {[...byStudent.entries()].map(([name, t]) => (
              <li
                key={name}
                className="flex items-center justify-between border-b border-slate-100 p-4 last:border-0 dark:border-slate-700"
              >
                <span className="flex items-center gap-3 font-medium">
                  <Avatar name={name} size="sm" /> {name}
                </span>
                <span className="text-right">
                  <span className="block font-bold text-indigo-700 dark:text-indigo-300">
                    {fmtMoney(t.amount)}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {fmtDuration(t.minutes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sous-totaux par matière */}
      {bySubject.size > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Par matière</h2>
          <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {[...bySubject.entries()].map(([name, t]) => (
              <li
                key={name}
                className="flex items-center justify-between border-b border-slate-100 p-4 last:border-0 dark:border-slate-700"
              >
                <span className="font-medium">{name}</span>
                <span className="text-right">
                  <span className="block font-bold text-indigo-700 dark:text-indigo-300">
                    {fmtMoney(t.amount)}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {fmtDuration(t.minutes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Détail des sessions */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Détail des sessions</h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Aucune session terminée sur les 14 derniers jours.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div>
                  <p className="font-medium">
                    {s.student?.name ?? 'Élève'}
                    {s.subject?.name && (
                      <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                        {s.subject.name}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {s.end_time && fmtDate(s.end_time)}
                    {s.start_time && s.end_time && (
                      <>
                        {' '}
                        · {fmtTime(s.start_time)} → {fmtTime(s.end_time)}
                      </>
                    )}
                  </p>
                </div>
                <span className="text-right">
                  <span className="block font-bold text-indigo-700 dark:text-indigo-300">
                    {fmtMoney(sessionAmount(s, rateOf(s)))}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {fmtDuration(sessionMinutes(s))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
