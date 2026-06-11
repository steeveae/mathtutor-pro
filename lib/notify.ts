// Notifications.
// - Locales (app ouverte) : via le service worker, exigé sur Android.
// - Vraies push (app fermée) : abonnement Web Push enregistré dans
//   Supabase, envoi par la fonction serveur "push".

import { supabase } from '@/lib/supabase';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function registerNotificationWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch {
    // pas bloquant : on retombera sur new Notification() si possible
  }
}

export async function askNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  await registerNotificationWorker();
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Notification locale immédiate (app ouverte)
export async function notify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      });
      return;
    }
  } catch {}
  try {
    new Notification(title, { body, icon: '/icon-192.png' });
  } catch {}
}

// ------------------------------------------------------------
// Vraies notifications push (app fermée)
// ------------------------------------------------------------
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Abonne cet appareil aux push et enregistre l'abonnement en base.
export async function enablePush(userId: string): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (
    !publicKey ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return false;
  }
  try {
    await registerNotificationWorker();
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) return false;
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    return true;
  } catch {
    return false;
  }
}

// Demande au serveur d'envoyer une push aux destinataires
// (même si leur app est fermée). Ne bloque jamais l'action en cours.
export async function sendPush(payload: {
  to?: 'tutors';
  user_ids?: string[];
  title: string;
  body: string;
}) {
  try {
    await supabase.functions.invoke('push', { body: payload });
  } catch {
    // la fonction n'est peut-être pas encore déployée : on ignore
  }
}
