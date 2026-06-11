// Service worker MathTutor Pro : notifications (Android exige un
// service worker) + réception des vraies notifications push
// envoyées par le serveur même quand l'app est fermée.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Notification push reçue du serveur (app ouverte ou fermée)
self.addEventListener('push', (event) => {
  let data = { title: 'MathTutor Pro', body: '' };
  try {
    data = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'MathTutor Pro', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  );
});

// Clic sur une notification → ouvre (ou refocalise) l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
