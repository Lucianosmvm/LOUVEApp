const CACHE = 'louva-plus-v6';

// Tudo que precisa funcionar offline
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Instala e cacheia os assets principais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cacheia assets locais obrigatórios
      return cache.addAll(['./index.html', './manifest.json'])
        .then(() => {
          // Tenta cachear fontes (falha silenciosa se offline na instalação)
          return cache.add(ASSETS[2]).catch(() => {});
        });
    }).then(() => self.skipWaiting())
  );
});

// Ativa e remove caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estratégia: Cache First para assets locais, Network First para fontes
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Fontes do Google: tenta rede, cai para cache
  if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.googleapis')) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(event.request)
          .then(res => { cache.put(event.request, res.clone()); return res; })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }

  // index.html: rede primeiro para sempre pegar versão nova
  if (url.origin === self.location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'))) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Outros assets locais: cache primeiro
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(event.request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }
});
