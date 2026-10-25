import { defineConfig } from 'vite-plus';

export default defineConfig({
  defaultPackage: './apps/obsidian-plugin',
  fmt: {
    ignorePatterns: ['**/dist/**', '**/node_modules/**', '**/example/**', 'THIRD_PARTY_NOTICES.md'],
    singleQuote: true,
    semi: true,
  },
  lint: {
    ignorePatterns: ['**/dist/**', '**/node_modules/**', '**/example/**'],
    plugins: ['typescript', 'react'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
