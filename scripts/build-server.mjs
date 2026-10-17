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
