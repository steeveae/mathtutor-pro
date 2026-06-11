import { createClient } from '@supabase/supabase-js';

// Client Supabase côté navigateur (clé anon : les accès sont
// protégés par les politiques RLS définies dans supabase/schema.sql).
// Les valeurs de repli permettent au build de passer sans .env.local ;
// en local comme sur Vercel, les vraies variables doivent être définies.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
);
