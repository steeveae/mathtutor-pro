'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  role: 'tutor' | 'student';
  name: string;
  email: string;
};

// Hook de protection des pages : charge le profil de l'utilisateur connecté.
// - Pas de session → redirection vers /login
// - Mauvais rôle (un élève sur /tutor par ex.) → redirection vers son dashboard
// Retourne null pendant le chargement.
export function useProfile(requiredRole?: 'tutor' | 'student') {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, role, name, email')
        .eq('id', user.id)
        .single();

      if (!data) {
        router.replace('/login');
        return;
      }
      if (requiredRole && data.role !== requiredRole) {
        router.replace(data.role === 'tutor' ? '/tutor' : '/student');
        return;
      }
      if (active) setProfile(data as Profile);
    }

    load();
    return () => {
      active = false;
    };
  }, [router, requiredRole]);

  return profile;
}

// Déconnexion puis retour à l'écran de connexion.
export async function signOut(router: { replace: (url: string) => void }) {
  await supabase.auth.signOut();
  router.replace('/login');
}
