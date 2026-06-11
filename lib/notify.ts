// Notifications navigateur. Sur Android (Chrome mobile), elles
// DOIVENT passer par un service worker — new Notification() y est
// interdit. On enregistre donc /sw.js et on privilégie
// registration.showNotification().

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

export async function notify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  // Voie Android / PWA : via le service worker
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

  // Voie ordinateur : notification directe
  try {
    new Notification(title, { body, icon: '/icon-192.png' });
  } catch {}
}
