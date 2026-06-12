'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/lib/types';

export type { Profile };

// Page d'accueil de chaque rôle
export const ROLE_HOME: Record<Role, string> = {
  tutor: '/tutor',
  student: '/student',
  parent: '/parent',
};

// Hook de protection des pages : charge le profil de l'utilisateur connecté.
// - Pas de session → redirection vers /login
// - Mauvais rôle (un élève sur /tutor par ex.) → redirection vers son espace
// Retourne null pendant le chargement.
export function useProfile(requiredRole?: Role) {
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
        .select('id, role, name, email, hourly_rate, linked_parent_id, notification_prefs')
        .eq('id', user.id)
        .single();

      if (!data) {
        router.replace('/login');
        return;
      }
      const p = data as Profile;
      if (requiredRole && p.role !== requiredRole) {
        router.replace(ROLE_HOME[p.role] ?? '/login');
        return;
      }
      if (active) setProfile(p);
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
