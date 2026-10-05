import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages (project site) serves the app under /<repo>/.
// CI sets BASE_PATH; local dev uses '/'.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'samples/*.svg'],
      manifest: {
        name: 'ナノビーズ図案メーカー',
        short_name: 'ナノビーズ図案',
        description: 'カワダ「ナノビーズ」の全色に対応したアイロンビーズ図案メーカー。写真やイラストからそのまま図案を作れます。',
        lang: 'ja',
        theme_color: '#ff6f9c',
        background_color: '#fff9f5',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    // 画面を何度も操作するテストは、カバレッジ計測中や CI では 5 秒を超えることがある
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary', 'json'],
      // 単体テストのカバレッジ100%を維持する (下回ると CI が失敗)
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
