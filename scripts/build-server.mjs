import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/bootstrap.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
});

await build({
  entryPoints: ['scripts/migrate.ts'],
  outfile: 'dist/migrate.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
});

// Ship executable configuration; runtime needs neither TypeScript nor source files.
await build({
  entryPoints: ['next.config.ts'],
  outfile: 'dist/next.config.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
});
