import { defineConfig } from 'vite-plus';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  defaultPackage: './apps/obsidian-plugin',
  test: {
    alias: {
      obsidian: fileURLToPath(
        new URL('./apps/obsidian-plugin/src/test-support/obsidian.ts', import.meta.url),
      ),
    },
  },
  fmt: {
    ignorePatterns: [
      '**/dist/**',
      '**/node_modules/**',
      '**/example/**',
      'THIRD_PARTY_NOTICES.md',
      'main.js',
      'styles.css',
    ],
    singleQuote: true,
    semi: true,
  },
  lint: {
    ignorePatterns: ['**/dist/**', '**/node_modules/**', '**/example/**', 'main.js'],
    plugins: ['typescript', 'react'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
