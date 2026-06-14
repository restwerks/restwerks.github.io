/* RestWerks PWA service worker — v1.32.0 (Slice A).
   Installable app + offline shell for the dashboard ONLY.
   Conservative by design: it never touches the portal API (cross origin),
   never touches non-GET requests, and lets pitch.html / ops.html / the
   marketing root go straight to the network untouched. */
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
