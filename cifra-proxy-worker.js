// ─────────────────────────────────────────────────────────────────────────────
// PROXY PROPRIO PRA BAIXAR CIFRA (Cloudflare Worker, plano gratis)
//
// Por que existe: www.cifraclub.com.br nao manda header CORS, entao o navegador
// nao deixa o app ler a pagina. Os proxies publicos genericos (allorigins,
// codetabs, corsfix) vivem caindo -- em 09/09/2026 os tres estavam fora ao
// mesmo tempo (522, 522, 403). Este worker resolve isso de vez: e seu, ninguem
// mais usa, e o plano free da Cloudflare da 100 mil requisicoes por dia sem
// pedir cartao.
//
// COMO SUBIR (5 minutos, tudo pelo site, sem instalar nada):
//   1. Crie conta em https://dash.cloudflare.com (gratis).
//   2. Menu lateral: Workers & Pages -> Create -> Workers -> Create Worker.
//   3. De um nome, ex.: cifra-proxy. Clique Deploy.
//   4. Clique "Edit code", apague o exemplo, cole este arquivo inteiro, Deploy.
//   5. Copie a URL que aparece (ex.: https://cifra-proxy.SEU-NOME.workers.dev).
//   6. No index.html, ache a linha `const CC_WORKER = '';` e ponha a URL com
//      /?url= no fim:
//         const CC_WORKER = 'https://cifra-proxy.SEU-NOME.workers.dev/?url=';
//   7. Commit e push. Pronto -- o worker passa a ser a primeira tentativa.
//
// A lista de dominios liberados embaixo e o que impede este worker de virar
// proxy aberto pro mundo inteiro usar (e a Cloudflare derrubar por abuso).
// ─────────────────────────────────────────────────────────────────────────────

const DOMINIOS_OK = ['www.cifraclub.com.br', 'cifraclub.com.br'];

export default {
  async fetch(request) {
    const origem = request.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': origem,
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('so GET', { status: 405, headers: cors });

    const alvo = new URL(request.url).searchParams.get('url');
    if (!alvo) return new Response('faltou o parametro ?url=', { status: 400, headers: cors });

    let u;
    try { u = new URL(alvo); } catch (e) {
      return new Response('url invalida', { status: 400, headers: cors });
    }
    if (u.protocol !== 'https:' || !DOMINIOS_OK.includes(u.hostname)) {
      return new Response('dominio nao liberado', { status: 403, headers: cors });
    }

    // cacheEverything guarda a pagina na borda da Cloudflare por 1h: a segunda
    // pessoa que baixar a mesma cifra nem chega a bater no Cifra Club.
    const r = await fetch(u.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });

    return new Response(r.body, {
      status: r.status,
      headers: Object.assign({}, cors, {
        'Content-Type': r.headers.get('Content-Type') || 'text/html; charset=utf-8'
      })
    });
  }
};
