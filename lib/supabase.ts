import { createClient } from '@supabase/supabase-js';

// Client Supabase côté navigateur (clé anon : les accès sont
// protégés par les politiques RLS définies dans supabase/schema.sql).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
