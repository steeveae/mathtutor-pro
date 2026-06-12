// ============================================================
// MathTutor Pro — Fonction serveur "push"
// Envoie de vraies notifications push (Web Push) aux appareils
// abonnés, même quand l'application est fermée, en respectant
// les préférences de notifications de chaque destinataire.
//
// À déployer dans : Dashboard Supabase → Edge Functions
// Secrets requis (Edge Functions → Secrets) :
//   - VAPID_KEYS    : paire de clés JSON fournie par Claude
//   - VAPID_SUBJECT : mailto:votre-email
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.3.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // 1. L'appelant doit être un utilisateur connecté de l'app
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401, headers: cors });
    }

    // 2. Destinataires : liste d'utilisateurs, ou tous les tuteurs
    const { to, user_ids, title, body, event } = await req.json();
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let targets: string[] = Array.isArray(user_ids) ? user_ids : [];
    if (to === 'tutors') {
      const { data } = await admin.from('profiles').select('id').eq('role', 'tutor');
      targets = (data ?? []).map((r: { id: string }) => r.id);
    }
    if (targets.length === 0) {
      return Response.json({ sent: 0 }, { headers: cors });
    }

    // 3. Respect des préférences de notifications de chacun :
    //    clé absente = activé ; event absent = toujours envoyé
    if (event) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, notification_prefs')
        .in('id', targets);
      targets = (profs ?? [])
        .filter(
          (p: { id: string; notification_prefs?: Record<string, boolean> }) =>
            (p.notification_prefs ?? {})[event] !== false
        )
        .map((p: { id: string }) => p.id);
      if (targets.length === 0) {
        return Response.json({ sent: 0 }, { headers: cors });
      }
    }

    // 4. Tous les appareils abonnés de ces utilisateurs
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', targets);

    // 5. Envoi chiffré à chaque appareil (signature VAPID)
    const vapidKeys = await webpush.importVapidKeys(
      JSON.parse(Deno.env.get('VAPID_KEYS')!),
      { extractable: false }
    );
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
      vapidKeys,
    });

    let sent = 0;
    for (const s of subs ?? []) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        });
        await subscriber.pushTextMessage(
          JSON.stringify({ title: title ?? 'MathTutor Pro', body: body ?? '' }),
          {}
        );
        sent++;
      } catch {
        // Abonnement expiré (app désinstallée…) → nettoyage
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }

    return Response.json({ sent }, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: cors });
  }
});
