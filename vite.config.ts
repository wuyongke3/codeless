import fs from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electronMulti, { electronSimple } from 'vite-plugin-electron/multi-env'
import { notBundle } from 'vite-plugin-electron/plugin'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  fs.rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    plugins: [
      vue(),
      electronSimple({
        main: {
          input: 'electron/main/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          plugins: [notBundle()],
          options: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
            },
          },
        },
        // Polyfill the Electron and Node.js API for Renderer process.
        // If you want to use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See https://github.com/electron-vite/vite-plugin-electron-renderer
        // renderer: {},
      }),
      electronMulti([{
        name: 'database',
        input: 'electron/database/worker.ts',
        plugins: [notBundle()],
        // The database utility process must never trigger Electron startup in dev mode.
        onstart: () => undefined,
        options: {
          build: {
            sourcemap,
            minify: isBuild,
            outDir: 'dist-electron/database',
          },
        },
      }]),
    ],
    clearScreen: false,
  }
})
