// Service Worker for native background Push Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle native background push events
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'BFC Freiburg';
    const options = {
      body: data.message || '',
      icon: '/icon.png', // Fallback icon path
      badge: '/icon.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || self.location.origin
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    // If the payload is just plain text
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('BFC Freiburg', {
        body: text,
        vibrate: [200, 100, 200]
      })
    );
  }
});

// Handle clicking on the native notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window tab open and focus it
      for (let client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
