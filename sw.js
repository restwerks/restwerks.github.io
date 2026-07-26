/* RestWerks PWA service worker v1.33.0 (Slice B: web push + badge).
   Installable app + offline shell for the dashboard, PLUS the push layer:
   a push event shows the notification and lights the app icon badge, and
   tapping the notification focuses the dashboard deep linked to the thread.
   Still conservative: never touches the portal API (cross origin), never
   touches non GET requests, and lets pitch.html / ops.html / the marketing
   root go straight to the network untouched. Filename stays literally sw.js
   by design (GitHub Pages root, never version stamped). */
var CACHE = 'restwerks-shell-v1';
var SHELL = [
  '/dashboard.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(SHELL).catch(function(){ /* tolerate a missing asset on first deploy */ });
  }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k !== CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;                  // never interfere with writes
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   // never touch the portal API or any cross origin

  // Dashboard navigations: network first, fall back to the cached shell when offline.
  if(req.mode === 'navigate'){
    if(url.pathname === '/dashboard.html'){
      e.respondWith(
        fetch(req).then(function(res){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put('/dashboard.html', copy); });
          return res;
        }).catch(function(){ return caches.match('/dashboard.html'); })
      );
    }
    return; // every other route (root, pitch, ops) goes straight to network
  }

  // Precached static assets (icons, manifest): cache first.
  if(SHELL.indexOf(url.pathname) !== -1){
    e.respondWith(caches.match(req).then(function(c){ return c || fetch(req); }));
  }
});

/* v1.33.0: push. The portal sends {title, body, phone, kind} (see portal v1.56.0 sendPush).
   Show the notification with the shipped monogram, light the app icon badge (iOS 16.4+ on an
   installed PWA), and carry the phone through to the click handler. Everything best effort. */
self.addEventListener('push', function(e){
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = { title: 'RestWerks', body: '' }; }
  var title = data.title || 'RestWerks';
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.phone ? ('rw-' + data.phone) : undefined, // one live notification per thread, newest wins
    data: { phone: data.phone || null, kind: data.kind || null }
  };
  var work = self.registration.showNotification(title, options);
  // App icon badge: a flag style badge (no count yet; a real unread count is a later slice).
  try { if (navigator.setAppBadge) work = Promise.all([work, navigator.setAppBadge()]); } catch(err) {}
  e.waitUntil(work.catch(function(){}));
});

/* Tap the notification: focus an open dashboard and tell it which thread to open, or launch
   the dashboard deep linked with #thread= so a cold start lands in the right conversation. */
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var phone = e.notification.data && e.notification.data.phone;
  var target = '/dashboard.html' + (phone ? ('#thread=' + encodeURIComponent(phone)) : '');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf('/dashboard.html') !== -1) {
          c.postMessage({ type: 'open_thread', phone: phone || null });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }).catch(function(){})
  );
});
