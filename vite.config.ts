import { defineConfig } from 'vite-plus';

export default defineConfig({
  defaultPackage: './apps/obsidian-plugin',
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
