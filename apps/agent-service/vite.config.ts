import { defineConfig } from 'vite-plus';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    target: 'node20',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'agent-service.mjs',
    },
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      external: [/^node:/],
      output: {
        codeSplitting: false,
      },
    },
  },
});
