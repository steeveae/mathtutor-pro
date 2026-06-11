'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BookOpen,
  CalendarDays,
  FolderOpen,
  Loader2,
  LogOut,
  Receipt,
  UserCircle,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile, signOut } from '@/lib/useProfile';
import {
  askNotificationPermission,
  enablePush,
  notify,
  notificationsSupported,
  registerNotificationWorker,
} from '@/lib/notify';
import { DarkModeToggle } from '@/components/ui';
import SessionsTab from '@/components/tutor/SessionsTab';
import HomeworksTab from '@/components/tutor/HomeworksTab';
import DocumentsTab from '@/components/tutor/DocumentsTab';
import StudentsTab from '@/components/tutor/StudentsTab';
import BillingTab from '@/components/tutor/BillingTab';
import SettingsTab from '@/components/SettingsTab';
import '@/lib/install'; // capture l'invitation d'installation PWA au plus tôt

type TabId = 'sessions' | 'homeworks' | 'docs' | 'students' | 'billing' | 'settings';

const TABS: { id: TabId; label: string; icon: typeof CalendarDays }[] = [
  { id: 'sessions', label: 'Sessions', icon: CalendarDays },
  { id: 'homeworks', label: 'Devoirs', icon: BookOpen },
  { id: 'docs', label: 'Documents', icon: FolderOpen },
  { id: 'students', label: 'Élèves', icon: Users },
  { id: 'billing', label: 'Facturation', icon: Receipt },
  { id: 'settings', label: 'Profil', icon: UserCircle },
];

export default function TutorDashboard() {
  const router = useRouter();
  const profile = useProfile('tutor');
  const [tab, setTab] = useState<TabId>('sessions');
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

  // Notification quand un élève envoie un devoir
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('tutor-homeworks')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'homeworks' },
        (payload) => {
          const next = payload.new as { status?: string };
          const prev = payload.old as { status?: string };
          if (next.status === 'submitted' && prev.status !== 'submitted') {
            notify('MathTutor Pro', 'Un élève a envoyé son devoir 📸');
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
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-4 pb-10">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">
            Bonjour {profile.name} 👋
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Espace Tuteur</p>
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

      {/* Onglets (défilables sur petit écran) */}
      <nav className="mb-6 flex gap-2 overflow-x-auto rounded-2xl bg-slate-200 p-1 dark:bg-slate-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
              tab === id
                ? 'bg-white text-indigo-700 shadow dark:bg-slate-700 dark:text-indigo-300'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 4)}.</span>
          </button>
        ))}
      </nav>

      {/* L'onglet Sessions (qui héberge l'appel audio) reste monté en
          permanence : changer d'onglet ne coupe pas l'appel. */}
      <div className={tab === 'sessions' ? '' : 'hidden'}>
        <SessionsTab
          tutorId={profile.id}
          tutorName={profile.name}
          active={tab === 'sessions'}
        />
      </div>
      {tab === 'homeworks' && <HomeworksTab tutorId={profile.id} />}
      {tab === 'docs' && <DocumentsTab />}
      {tab === 'students' && <StudentsTab />}
      {tab === 'billing' && <BillingTab />}
      {tab === 'settings' && <SettingsTab profile={profile} />}
    </main>
  );
}
