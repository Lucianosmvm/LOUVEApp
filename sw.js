const CACHE = 'louva-plus-v9';

// Por que existe prazo em tudo que vem da rede: no Wi-Fi fraco da igreja o
// celular "conecta mas não navega", e o pedido fica pendurado em vez de falhar.
// A página espera o index.html, a folha de fontes e o SDK do Firebase antes de
// desenhar, então um pedido pendurado vira tela branca bem na hora do culto.
// Com prazo, o que já está no cache aparece na hora e a rede só atualiza por trás.
const PRAZO_PAGINA = 3500; // index.html: quanto espera a versão nova antes de abrir a do cache
const PRAZO_EXTERNO = 5000; // fonte/SDK que ainda não está no cache (só a primeira vez)

const FONTES_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap';

// URL com versão no caminho: o conteúdo nunca muda, pode vir sempre do cache.
// Se trocar a versão no index.html, troque aqui também.
const FIREBASE_SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

// Instala e cacheia os assets principais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // Locais são obrigatórios; o resto é tentativa (pode estar offline na instalação)
      cache.addAll(['./index.html', './manifest.json']).then(() =>
        Promise.all([FONTES_CSS, ...FIREBASE_SDK].map(u =>
          cache.add(new Request(u, { mode: 'cors', credentials: 'omit' })).catch(() => {})))
      )
    ).then(() => self.skipWaiting())
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

function comPrazo(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('prazo')), ms);
    promessa.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Busca na rede e guarda no cache quando der certo. A cópia é tirada assim que
// a resposta chega, antes de a página começar a ler o corpo.
function buscaEGuarda(request, chave) {
  const resposta = fetch(request);
  const guardado = resposta.then(res => {
    if (!res.ok) return;
    const copia = res.clone();
    return caches.open(CACHE).then(c => c.put(chave, copia));
  }).catch(() => {});
  return { resposta, guardado };
}

// Externos (fontes e Firebase) são pedidos em modo cors: esses servidores
// mandam Access-Control-Allow-Origin: *, e resposta cors ocupa o tamanho real
// no cache (resposta opaca o Chrome conta como vários MB cada).
function externoDoCache(event, { revalidar, tipo }) {
  const chave = event.request.url;
  event.respondWith(
    caches.match(chave).then(cached => {
      if (cached) {
        if (revalidar) event.waitUntil(buscaEGuarda(new Request(chave, { mode: 'cors', credentials: 'omit' }), chave).guardado);
        return cached;
      }
      const { resposta, guardado } = buscaEGuarda(new Request(chave, { mode: 'cors', credentials: 'omit' }), chave);
      event.waitUntil(guardado);
      // Primeira vez e rede pendurada: devolve vazio pra página abrir. Sem o
      // Firebase o app funciona só com as músicas do aparelho; sem as fontes
      // usa as do sistema. Na próxima abertura já vem do cache.
      return comPrazo(resposta, PRAZO_EXTERNO)
        .catch(() => new Response('', { status: 200, headers: { 'Content-Type': tipo } }));
    })
  );
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // SDK do Firebase: cache primeiro, sem revalidar (arquivo versionado)
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    externoDoCache(event, { revalidar: false, tipo: 'application/javascript' });
    return;
  }

  // Folha de fontes: cache primeiro, atualiza por trás
  if (url.hostname === 'fonts.googleapis.com') {
    externoDoCache(event, { revalidar: true, tipo: 'text/css' });
    return;
  }

  // Arquivos de fonte: não mudam; não travam a tela (display=swap)
  if (url.hostname === 'fonts.gstatic.com') {
    externoDoCache(event, { revalidar: false, tipo: 'font/woff2' });
    return;
  }

  // index.html: rede primeiro pra pegar versão nova, mas com prazo. Guardado
  // sempre como ./index.html, então o link de convite (?equipe=...) também abre offline.
  if (url.origin === self.location.origin &&
      (event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html'))) {
    const { resposta, guardado } = buscaEGuarda(event.request, './index.html');
    event.waitUntil(guardado); // se a rede responder depois do prazo, a versão nova fica pra próxima vez
    event.respondWith(
      comPrazo(resposta, PRAZO_PAGINA)
        .catch(() => caches.match('./index.html').then(cached => cached || resposta))
    );
    return;
  }

  // Outros assets locais: cache primeiro
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        const { resposta, guardado } = buscaEGuarda(event.request, event.request);
        event.waitUntil(guardado);
        return resposta;
      })
    );
    return;
  }
});
