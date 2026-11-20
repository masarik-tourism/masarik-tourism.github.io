/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

var MASARIK_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0015800098',
  appId: '1:588431549120:web:c10278b3df39d11a668325',
  apiKey: 'AIzaSyBQr3KBjflgGkog8b5knhlW4AClpw5Iils',
  authDomain: 'gen-lang-client-0015800098.firebaseapp.com',
  storageBucket: 'gen-lang-client-0015800098.firebasestorage.app',
  messagingSenderId: '588431549120',
};

function buildMasarikTargetUrl(data) {
  var safeData = data && typeof data === 'object' ? data : {};
  if (safeData.url && typeof safeData.url === 'string' && safeData.url.startsWith('/')) {
    return safeData.url;
  }
  var params = new URLSearchParams();
  if (safeData.role) params.set('push_role', String(safeData.role));
  if (safeData.action) params.set('push_action', String(safeData.action));
  if (safeData.phone) params.set('push_phone', String(safeData.phone));
  var query = params.toString();
  return query ? '/?' + query : '/';
}

try {
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(MASARIK_FIREBASE_CONFIG);
  }
  if (typeof firebase !== 'undefined' && firebase.messaging && firebase.messaging.isSupported()) {
    var messaging = firebase.messaging();
    messaging.onBackgroundMessage(function (payload) {
      var notif = (payload && payload.notification) || {};
      var data = (payload && payload.data) || {};
      var title = notif.title || data.title || 'مسارك للإنجاز السياحي';
      var body = notif.body || data.body || 'لديك تحديث أو رسالة جديدة.';
      var tag = data.tag || 'masarik-fcm-notification';
      var targetUrl = buildMasarikTargetUrl(data);

      return self.registration.showNotification(title, {
        body: body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        dir: 'rtl',
        lang: 'ar',
        vibrate: [220, 100, 220],
        requireInteraction: true,
        tag: tag,
        renotify: true,
        data: {
          role: data.role || '',
          action: data.action || '',
          phone: data.phone || '',
          url: targetUrl,
        },
      });
    });
  }
} catch (err) {
  // Fallback safely so local SW notifications and notificationclick always stay active
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  if (!event.data || event.data.type !== 'SHOW_MASARIK_NOTIFICATION') return;
  var payload = event.data.payload || {};
  var title = payload.title || 'مسارك للإنجاز السياحي';
  var body = payload.body || 'لديك إشعار جديد.';
  var data = payload.data || {};
  var targetUrl = buildMasarikTargetUrl(data);

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [220, 100, 220],
      requireInteraction: true,
      tag: payload.tag || 'masarik-live-notification',
      renotify: true,
      data: {
        role: data.role || '',
        action: data.action || '',
        phone: data.phone || '',
        url: targetUrl,
      },
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var targetUrl = buildMasarikTargetUrl(data);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (client.url && client.url.indexOf(self.location.origin) === 0) {
            client.postMessage({
              type: 'MASARIK_PUSH_NAVIGATE',
              payload: {
                role: data.role || '',
                action: data.action || '',
                phone: data.phone || '',
              },
            });
            if ('focus' in client) {
              return client.focus();
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
