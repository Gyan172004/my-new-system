import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildMigrationManifest } from '../../scripts/build-migration-manifest';
const owned: string[] = [];
afterEach(async () => {
  await Promise.all(
    owned.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'foundation-manifest-'));
  owned.push(root);
  return root;
}
it('packages an ordered migration identity list using only local filenames', async () => {
  const root = await fixture();
  const source = join(root, 'migrations');
  await mkdir(source);
  await writeFile(join(source, '1781654400001_second.sql'), 'SELECT 1;');
  await writeFile(join(source, '1781654400000_foundation.sql'), 'SELECT 1;');
  const output = join(root, 'dist', 'migration-manifest.json');
  await buildMigrationManifest(source, output);
  expect(JSON.parse(await readFile(output, 'utf8'))).toEqual([
    '1781654400000_foundation',
    '1781654400001_second',
  ]);
});
it('records no migrations before the storage phase creates them', async () => {
  const root = await fixture();
  const output = join(root, 'manifest.json');
  await buildMigrationManifest(join(root, 'not-created'), output);
  expect(JSON.parse(await readFile(output, 'utf8'))).toEqual([]);
});
it('rejects ambiguous migration order instead of packaging an arbitrary head', async () => {
  const root = await fixture();
  await writeFile(join(root, '1781654400000_first.sql'), 'SELECT 1;');
  await writeFile(join(root, '1781654400000_other.sql'), 'SELECT 1;');
  await expect(
    buildMigrationManifest(root, join(root, 'manifest.json')),
  ).rejects.toThrow('migration_manifest_invalid');
});
