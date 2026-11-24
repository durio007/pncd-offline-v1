/* ==========================================
   PNCD V9 OFFLINE - CMB-SOFT
   Service Worker - Atualizacao de arquivos
   ========================================== */

// Alterar este nome a cada nova publicacao de arquivos do aplicativo.
const CACHE_NAME = 'pncd-offline-v1.0-github-v3';


const ARQUIVOS_OFFLINE = [
    './',
    './index.html',
    './painel.html',
    './usuarios.html',
    './formularios.html',
    './editar_formulario.html',
    './imprimir_formulario.html',
    './css/style.css',
    './manifest.json',
     './imagens/logo_cmb_soft.png',
    './imagens/logos_sus_tocantins.png',
    './imagens/icone-192.png',
    './imagens/icone-512.png',
    './js/banco.js'
];


self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(ARQUIVOS_OFFLINE);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes
            .filter(nome => nome.startsWith('pncd-offline-') && nome !== CACHE_NAME)
            .map(nome => caches.delete(nome)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const requisicao = event.request;
    if (requisicao.method !== 'GET') return;

    const url = new URL(requisicao.url);
    if (url.origin !== self.location.origin) return;

    const ehArquivoAplicativo = requisicao.mode === 'navigate' ||
        /\.(?:html|js|css|json|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);
    if (!ehArquivoAplicativo) return;

    // Rede primeiro: recebe atualizacoes quando o servidor esta disponivel.
    // Sem rede: usa a ultima versao salva, mantendo o funcionamento offline.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const resposta = await fetch(requisicao, { cache: 'no-store' });
            if (resposta.ok && resposta.type === 'basic') {
                await cache.put(requisicao, resposta.clone());
            }
            return resposta;
        } catch (erro) {

            const salva = await cache.match(requisicao);
                if (salva) return salva;

                // Permitir abertura de formularios offline com ID.
                if (/\.(?:html|js|css|json|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) {
                    const paginaBase = new URL(requisicao.url);

                    paginaBase.search = '';
                    paginaBase.hash = '';

                    const paginaSalva = await cache.match(
                        paginaBase.href
                    );

                    if (paginaSalva) return paginaSalva;
                }

                throw erro;
        }
    })());
});
