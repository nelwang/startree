import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';
import { VitePWA } from 'vite-plugin-pwa';

// Changes whenever the snapshot contract source changes, so retained snapshots written by a
// shell with a different contract are always validated again.
const bookmarkSnapshotSchemaId = createHash('sha256')
  .update(readFileSync('src/shared/bookmarks/contracts.ts'))
  .update(readFileSync('src/shared/bookmarks/constants.ts'))
  .update(readFileSync('node_modules/valibot/package.json'))
  .digest('hex')
  .slice(0, 16);

export default defineConfig({
  define: {
    __BOOKMARK_SNAPSHOT_SCHEMA_ID__: JSON.stringify(bookmarkSnapshotSchemaId),
  },
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/client',
      filename: 'service-worker.ts',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,ico,woff2}'],
        globIgnores: ['**/NotesPage-*', '**/notes-storage-*'],
        rollupFormat: 'iife',
      },
    }),
  ],
  build: {
    outDir: 'dist',
    manifest: true,
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  lint: {
    ignorePatterns: ['dist/**', '.cloudflare/**', 'worker-configuration.d.ts'],
  },
  fmt: {
    ignorePatterns: ['dist/**', '.cloudflare/**', 'worker-configuration.d.ts', 'package-lock.json'],
    singleQuote: true,
  },
  run: {
    tasks: {
      'verify:local:built': {
        command: ['node scripts/verify-notes-loading.mjs', 'node scripts/verify-local-worker.mjs'],
        dependsOn: ['build'],
        cache: false,
      },
      'verify:auxiliary': {
        command: ['npm test', 'npm run verify:migrations', 'npm run verify:config'],
        cache: false,
      },
      'verify:all': {
        command: 'node -e ""',
        dependsOn: ['check', 'verify:performance-data', 'verify:auxiliary', 'verify:local:built'],
        cache: false,
      },
      'verify:ci': {
        command: 'node -e ""',
        dependsOn: ['build', 'check', 'verify:performance-data', 'verify:auxiliary'],
        cache: false,
      },
    },
  },
});
