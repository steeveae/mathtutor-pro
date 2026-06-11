'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile, signOut } from '@/lib/useProfile';
import {
  fmtDate,
  fmtDuration,
  fmtMoney,
  sessionAmount,
  sessionMinutes,
} from '@/lib/format';
import type { Homework, Profile, Session } from '@/lib/types';
import { Avatar, CardSkeleton, DarkModeToggle, StatusBadge } from '@/components/ui';

// ============================================================
// Espace PARENT (lecture seule) : pour chaque enfant, les
// heures effectuées sur 14 jours, le montant correspondant,
// les comptes rendus de session et les devoirs avec notes.
// ============================================================
export default function ParentDashboard() {
  const router = useRouter();
  const profile = useProfile('parent');
  const [children, setChildren] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    async function load() {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const [{ data: childRows }, { data: sessionRows }, { data: homeworkRows }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, role, name, email, hourly_rate, linked_parent_id')
            .eq('linked_parent_id', profile!.id),
          supabase
            .from('sessions')
            .select('*')
            .eq('status', 'completed')
            .gte('end_time', since)
            .order('end_time', { ascending: false }),
          supabase
            .from('homeworks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20),
        ]);
      setChildren((childRows as Profile[]) ?? []);
      setSessions((sessionRows as Session[]) ?? []);
      setHomeworks((homeworkRows as Homework[]) ?? []);
      setLoading(false);
    }
    load();
  }, [profile]);

  if (!profile || loading) {
    return (
      <main className="mx-auto max-w-md p-4">
        <CardSkeleton />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-4 pb-10">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Bonjour {profile.name} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Espace Parent</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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

      {children.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Aucun enfant n&apos;est encore rattaché à votre compte. Demandez au tuteur
          de faire le lien.
        </p>
      ) : (
        <div className="fade-in flex flex-col gap-6">
          {children.map((child) => {
            const childSessions = sessions.filter((s) => s.student_id === child.id);
            const childHomeworks = homeworks.filter((h) => h.student_id === child.id);
            const minutes = childSessions.reduce((sum, s) => sum + sessionMinutes(s), 0);
            const amount = childSessions.reduce(
              (sum, s) => sum + sessionAmount(s, child.hourly_rate),
              0
            );
            return (
              <section key={child.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={child.name} />
                  <h2 className="text-lg font-bold">{child.name}</h2>
                </div>

                {/* Heures + montant sur 14 jours */}
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow">
                  <p className="flex items-center gap-2 text-sm uppercase tracking-wide opacity-80">
                    <Receipt className="h-4 w-4" /> 14 derniers jours
                  </p>
                  <p className="text-3xl font-extrabold">{fmtDuration(minutes)}</p>
                  <p className="text-xl font-bold opacity-95">{fmtMoney(amount)}</p>
                  <p className="mt-1 text-sm opacity-80">
                    {childSessions.length} session{childSessions.length > 1 ? 's' : ''} ·{' '}
                    {fmtMoney(child.hourly_rate)}/h
                  </p>
                </div>

                {/* Comptes rendus */}
                {childSessions.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {childSessions.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <p className="flex items-center gap-1 text-sm font-medium">
                          <Clock className="h-4 w-4 text-slate-400" />
                          {s.end_time && fmtDate(s.end_time)} ·{' '}
                          {fmtDuration(sessionMinutes(s))}
                        </p>
                        {s.notes && (
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {s.notes}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Devoirs récents */}
                {childHomeworks.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {childHomeworks.slice(0, 5).map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        <p className="min-w-0 truncate text-sm">{h.description}</p>
                        <span className="flex shrink-0 items-center gap-2">
                          {h.grade != null && (
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                              {h.grade}/20
                            </span>
                          )}
                          <StatusBadge status={h.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
