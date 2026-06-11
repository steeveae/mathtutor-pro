'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ROLE_HOME } from '@/lib/useProfile';
import type { Role } from '@/lib/types';

// Aiguillage : /login si déconnecté, sinon l'espace du rôle.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      router.replace(ROLE_HOME[(profile?.role as Role) ?? 'student'] ?? '/login');
    }
    redirect();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </main>
  );
}
