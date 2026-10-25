import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { createRequire } from 'node:module';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceEntry = resolve(import.meta.dirname, '../agent-service/src/index.ts');
const nodeExecutable =
  process.env.AULA_NODE_EXECUTABLE ??
  (process.env.NODE_ENV === 'development' ? process.execPath : 'node');
const tsxLoader = createRequire(import.meta.url).resolve('tsx');

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
    rollupOptions: {
      external: [/^node:/, 'obsidian'],
      output: {
        codeSplitting: false,
      },
    },
  },
  define: {
    __AULA_AGENT_SERVICE_ENTRY__: JSON.stringify(serviceEntry),
    __AULA_PROJECT_ROOT__: JSON.stringify(resolve(import.meta.dirname, '../..')),
    __AULA_NODE_EXECUTABLE__: JSON.stringify(nodeExecutable),
    __AULA_TSX_LOADER__: JSON.stringify(tsxLoader),
    __AULA_DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
  },
  plugins: [
    react(),
    {
      name: 'copy-agent-service-into-plugin-dist',
      closeBundle() {
        if (process.env.NODE_ENV === 'development') return;
        copyFileSync(
          resolve(import.meta.dirname, '../agent-service/dist/agent-service.mjs'),
          resolve(import.meta.dirname, 'dist/agent-service.mjs'),
        );
      },
    },
  ],
});
