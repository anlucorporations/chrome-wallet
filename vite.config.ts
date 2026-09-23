import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { writeFileSync } from 'fs'

// Plugin para generar manifest.json desde manifest.ts
function manifestPlugin(): Plugin {
  return {
    name: 'manifest-generator',
    closeBundle: async () => {
      // Importar dinámicamente el manifest
      const manifestModule = await import('./src/manifest.js')
      const manifest = manifestModule.default
      
      // Escribir manifest.json en dist/
      const distPath = resolve(__dirname, 'dist', 'manifest.json')
      writeFileSync(distPath, JSON.stringify(manifest, null, 2), 'utf-8')
      console.log('✅ manifest.json generado en dist/')
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    manifestPlugin()
  ],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        notification: './notification.html',
        connect: './connect.html',
        // Página de pruebas de la wallet (se mantiene junto a la extensión)
        test: './test.html',
        background: resolve(__dirname, 'src/background.ts'),
        'content-script': resolve(__dirname, 'src/content-script.ts'),
        floating: resolve(__dirname, 'src/floating.ts'),
        inject: resolve(__dirname, 'src/inject.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Los archivos de extensión deben estar en la raíz de dist, no en assets
          if (
            chunkInfo.name === 'background' ||
            chunkInfo.name === 'content-script' ||
            chunkInfo.name === 'floating' ||
            chunkInfo.name === 'inject'
          ) {
            return '[name].js'
          }
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
