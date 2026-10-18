import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildMigrationManifest(
  directory: string,
  output: string,
): Promise<void> {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      files = [];
    else {
      // eslint-disable-next-line preserve-caught-error -- Keep filesystem diagnostics out of sanitized build errors.
      throw new Error('migration_manifest_unavailable');
    }
  }
  const sql = files.filter((file) => file.endsWith('.sql')).sort();
  const prefixes = new Set<string>();
  for (const file of sql) {
    const prefix = file.slice(0, 13);
    if (!/^\d{13}_[a-z0-9_]+\.sql$/.test(file) || prefixes.has(prefix))
      throw new Error('migration_manifest_invalid');
    prefixes.add(prefix);
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      sql.map((file) => file.slice(0, -4)),
      null,
      2,
    ) + '\n',
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await buildMigrationManifest('migrations', 'dist/migration-manifest.json');
  } catch {
    process.stderr.write('migration_manifest_failed\n');
    process.exitCode = 1;
  }
}
