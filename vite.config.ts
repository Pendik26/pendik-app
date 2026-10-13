import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { SITE_ORIGIN } from './src/lib/site.ts'
import { supabaseEnv } from './src/lib/db/env.ts'
import { buildInfo } from './scripts/build-info.mjs'

// /privacy and /terms are the legal pages in public/legal/ (vercel.json rewrites them the same
// way in production), for `vite` and `vite preview`.
function legalPages(): Plugin {
  const pages = new Map([['/privacy', '/legal/privacy.html'], ['/terms', '/legal/terms.html']])
  const rewrite = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0].replace(/\/$/, '')
    // The old addresses, /privacy.html and /terms.html, redirect as they do in production.
    const old = path?.match(/^\/(privacy|terms)\.html$/)
    if (old) {
      res.statusCode = 301
      res.setHeader('Location', `/${old[1]}`)
      return res.end()
    }
    const page = path && pages.get(path)
    if (page) req.url = page
    next()
  }
  return {
    name: 'pendik-legal-pages',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  }
}

// /knowledge-graph.json is written by the prerender step; `vite` builds it on request instead.
function knowledgeGraphDev(): Plugin {
  return {
    name: 'pendik-knowledge-graph',
    apply: 'serve',
    configureServer(server) {
      let cached: string | null = null
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url?.split('?')[0] !== '/knowledge-graph.json') return next()
        try {
          if (cached === null) {
            const graph = await (await server.ssrLoadModule('/src/lib/knowledgeGraph/build.ts')).buildFromContent()
            cached = JSON.stringify((await server.ssrLoadModule('/src/lib/knowledgeGraph/wire.ts')).encodeGraph(graph))
          }
          res.setHeader('content-type', 'application/json')
          res.end(cached)
        } catch (err) {
          console.error(err)
          res.statusCode = 500
          res.end('Knowledge map build failed')
        }
      })
    },
  }
}

// The production site (src/lib/site.ts), used for the canonical link and the Open Graph/Twitter
// tags in index.html (link-preview crawlers only follow absolute URLs). Set SITE_URL to override
// it, e.g. for a fork deployed elsewhere. GOOGLE_SITE_VERIFICATION adds Search Console's
// verification tag.
function siteUrl(): Plugin {
  const origin = (process.env.SITE_URL || SITE_ORIGIN).replace(/\/+$/, '')
  const verification = process.env.GOOGLE_SITE_VERIFICATION?.replace(/[^A-Za-z0-9_-]/g, '')
  return {
    name: 'pendik-site-url',
    transformIndexHtml: (html) => {
      const withOrigin = html.replaceAll('%SITE_URL%', origin)
      return verification
        ? withOrigin.replace('</head>', `  <meta name="google-site-verification" content="${verification}" />\n  </head>`)
        : withOrigin
    },
  }
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  // The Supabase URL and public key, under the app's names or the Vercel integration's
  // (src/lib/db/env.ts). Only these two go into the page, never the secret keys.
  const supabase = supabaseEnv({ ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
    define: {
      // The version and build shown in the footer (src/lib/buildInfo.ts).
      __BUILD_INFO__: JSON.stringify(await buildInfo()),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabase.key),
    },
    plugins: [
      react(),
      legalPages(),
      knowledgeGraphDev(),
      siteUrl(),
      VitePWA({
        // "prompt": a new version waits until the student taps the update nudge (UpdateNudge /
        // useServiceWorkerUpdate), so a quiz or timed exam is never reloaded out from under them.
        // ("autoUpdate" with injectRegister: false never prompted and never took over: new versions
        // sat waiting until every tab was closed.)
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['pwa-icon.svg'],
        manifest: {
          name: 'Pendik — Study Tool',
          short_name: 'Pendik',
          description:
            'Flashcards, quizzes, past-paper exams, the class Drive, ebooks and summaries for Pendik 26 medical students.',
          categories: ['education', 'medical'],
          theme_color: '#0a0f0d',
          background_color: '#0a0f0d',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // PDFs (module lecture slides, ebook references) are excluded from the upfront
          // precache — content/modules alone already runs ~50MB, and forcing that onto every
          // first visit before anyone's opened a single module would be a bad trade for an
          // "offline-first" app that's supposed to load fast. Cached lazily instead, below.
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,woff2}'],
          // The link-preview image is only fetched by crawlers, never by the app.
          globIgnores: ['og-image.png'],
          cleanupOutdatedCaches: true,
          // Without this, the SPA navigate-fallback (needed so client-side routes like
          // /quizzes/histology work offline) also swallows iframe/direct navigation to a real
          // static file under /assets/ — e.g. opening a module PDF was silently served
          // index.html instead. Scoped to /assets/ specifically (not a general ".ext$" pattern)
          // since a route param can itself contain a dot, e.g. /exam/1.1.
          // So must the sitemap and robots.txt: opened in a browser, they'd otherwise show the app.
          // The privacy policy and terms are plain pages outside the app (served from legal/).
          navigateFallbackDenylist: [/\/assets\//, /\.(xml|txt)$/, /^\/(privacy|terms)(\.html)?\/?$/],
          runtimeCaching: [
            {
              // The knowledge map's data: fetched when the map is opened, then kept for offline.
              urlPattern: ({ url }) => url.pathname === '/knowledge-graph.json',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'knowledge-graph', cacheableResponse: { statuses: [200] } },
            },
            {
              // The 3D atlas's models (several MB each): kept once loaded. Their URLs carry a
              // version, so a changed model is fetched again.
              urlPattern: ({ url }) => url.pathname.startsWith('/atlas/') && /\.glb(\.gz)?$/.test(url.pathname),
              handler: 'CacheFirst',
              options: {
                cacheName: 'atlas-models',
                expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/atlas/') && url.pathname.endsWith('.json'),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'atlas-index', cacheableResponse: { statuses: [200] } },
            },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('.pdf'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'pdf-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 180,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Ebook slide figures (~7.5MB total) are cached as each chapter is read rather
              // than precached, for the same first-visit reason as the PDFs above.
              urlPattern: ({ url }) => url.pathname.startsWith('/ebook-figures/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'ebook-figure-cache',
                expiration: {
                  maxEntries: 400,
                  maxAgeSeconds: 60 * 60 * 24 * 180,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    build: {
      assetsInlineLimit: (filePath) => (filePath.endsWith('.pdf') ? false : undefined),
      rolldownOptions: {
        // Build-time hook timings are a profiling aid, not a problem with the build.
        checks: { pluginTimings: false },
        output: {
          codeSplitting: {
            groups: [
              // React/react-dom/react-router change far less often than app code —
              // splitting them out keeps that chunk cacheable across deploys instead
              // of re-downloading it every time any page's code changes.
              { name: 'vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
              // three.js is only for the 3D atlas, and changes far less often than the page.
              { name: 'three', test: /node_modules[\\/]three[\\/]/ },
              // Study content (decks, quiz and exam banks, summaries) gets one chunk per kind, so
              // editing a quiz only invalidates that chunk, and no single chunk grows past the
              // size limit. Ebook chapters and past-exam banks are loaded on demand and stay one
              // chunk each, out of the startup download.
              {
                name: (id) => {
                  const kind = id.match(/[\\/]content[\\/]([a-z]+)[\\/]/)?.[1]
                  return kind ? `content-${kind}` : null
                },
                test: (id) =>
                  /[\\/]content[\\/]/.test(id) && !/chapter-[^\\/]*\.md/.test(id) && !/[\\/]exams[\\/].*bank\.json/.test(id),
              },
            ],
          },
        },
      },
    },
  }
})
