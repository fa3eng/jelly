import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceEntry = resolve(import.meta.dirname, '../agent-service/src/index.ts');
const nodeExecutable =
  process.env.JELLY_NODE_EXECUTABLE ??
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
      external: [/^node:/, 'obsidian', '@electron/remote'],
      output: {
        codeSplitting: false,
      },
    },
  },
  define: {
    __JELLY_AGENT_SERVICE_ENTRY__: JSON.stringify(serviceEntry),
    __JELLY_AGENT_SERVICE_SOURCE__: JSON.stringify(
      process.env.NODE_ENV === 'development'
        ? ''
        : readFileSync(
            resolve(import.meta.dirname, '../agent-service/dist/agent-service.mjs'),
            'utf8',
          ),
    ),
    __JELLY_PROJECT_ROOT__: JSON.stringify(resolve(import.meta.dirname, '../..')),
    __JELLY_NODE_EXECUTABLE__: JSON.stringify(nodeExecutable),
    __JELLY_TSX_LOADER__: JSON.stringify(tsxLoader),
    __JELLY_DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
  },
  plugins: [
    react(),
    {
      name: 'jelly-manifest',
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: readFileSync(resolve(import.meta.dirname, '../../manifest.json'), 'utf8'),
        });
        const main = bundle['main.js'];
        if (main?.type !== 'chunk') throw new Error('Missing plugin entry bundle');
        const ownLicense = readFileSync(resolve(import.meta.dirname, '../../LICENSE'), 'utf8');
        const notices = readFileSync(
          resolve(import.meta.dirname, '../../THIRD_PARTY_NOTICES.md'),
          'utf8',
        );
        main.code =
          '/*!\n' + (ownLicense + '\n' + notices).replaceAll('*/', '* /') + '\n*/\n' + main.code;
      },
    },
  ],
});
