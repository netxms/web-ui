import { fileURLToPath, URL } from 'node:url'
import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import netxmsModules from './vite-plugin-netxms-modules.js'
import netxmsBrand from './vite-plugin-netxms-brand.js'

export default defineConfig({
  // Fixed modules and brand, whatever .env.local says. Specs that need another brand mock
  // `@/brands`.
  plugins: [vue(), netxmsModules({ modules: [] }), netxmsBrand({ brand: 'netxms' })],
  // Mirrors vite.config.js `define` so AboutDialog can mount.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_BUILD_DATE__: JSON.stringify('1970-01-01'),
  },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Without a dev server, a root-absolute public/ asset URL in a template fails the whole
      // spec file; point it back at public/.
      {
        find: /^\/([^/].*\.(?:png|jpe?g|gif|svg|webp|ico))$/,
        replacement: `${fileURLToPath(new URL('./public', import.meta.url))}/$1`,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**'],
    root: fileURLToPath(new URL('./', import.meta.url)),
  },
})
