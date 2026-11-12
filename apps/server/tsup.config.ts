import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node26',
  outDir: 'dist',
  clean: true,
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  external: ['better-sqlite3'],
  noExternal: ['@subhub/shared', '@subhub/proxy-core', 'dns-packet'],
});
