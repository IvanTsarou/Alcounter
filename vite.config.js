import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Алкаунтер — общак похода',
        short_name: 'Алкаунтер',
        description:
          'Калькулятор взаиморасчётов для похода. Особенности национального общака.',
        theme_color: '#163528',
        background_color: '#0f241c',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ru',
        start_url: './',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        mode: 'development',
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
