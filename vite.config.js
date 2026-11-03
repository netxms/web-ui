import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import mockApiPlugin from './vite-plugin-mock-api.js'
import netxmsModules, { parseModuleList } from './vite-plugin-netxms-modules.js'
import netxmsBrand from './vite-plugin-netxms-brand.js'
import netxmsDemo from './vite-plugin-netxms-demo.js'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_')
  const useMocks = env.VITE_USE_MOCKS === 'true'
  const sourcemap = env.VITE_SOURCEMAP === 'true'
  const isDev = mode === 'development'
  const modules = parseModuleList(env.VITE_MODULES)

  return {
    define: {
      // define substitutes raw text, hence JSON.stringify.
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    plugins: [
      vue(),
      isDev && vueDevTools(),
      useMocks && mockApiPlugin({ modules }),
      netxmsModules({ modules }),
      netxmsBrand({ brand: env.VITE_BUILD_VARIANT }),
      netxmsDemo({ enabled: env.VITE_DEMO_CONTENT !== 'false' }),
    ].filter(Boolean),
    build: {
      sourcemap,
      rollupOptions: {
        output: {
          /**
           * Stable, named chunks for large shared libraries; everything else stays with its
           * route. First match wins, so the specific cytoscape/codemirror entries come first.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined

            if (/[\\/]node_modules[\\/](echarts|zrender)[\\/]/.test(id)) return 'vendor-echarts'
            if (/[\\/]node_modules[\\/]cytoscape/.test(id)) return 'vendor-cytoscape'
            if (/[\\/]node_modules[\\/](leaflet|@?leaflet)/.test(id)) return 'vendor-leaflet'
            if (/[\\/]node_modules[\\/](@codemirror|@lezer|codemirror)[\\/]/.test(id)) {
              return 'vendor-codemirror'
            }
            if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'vendor-three'
            if (/[\\/]node_modules[\\/]primevue[\\/]/.test(id)) return 'vendor-primevue'
            if (/[\\/]node_modules[\\/](@vue|vue|vue-router|pinia)[\\/]/.test(id)) {
              return 'vendor-vue'
            }
            if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'vendor-query'

            return undefined
          },
        },
      },
    },
    optimizeDeps: {
      include: ['vue', 'vue-echarts', 'echarts'],
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
