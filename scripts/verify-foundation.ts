import {
  createProcessProject,
  availablePort,
  eventually,
  portIsFree,
} from '../tests/helpers/process';
import { acceptedMigrations } from '../tests/helpers/migration-chain';
import { allocateTestDatabase } from '../tests/helpers/test-database';
import { databaseProxy } from '../tests/helpers/database-proxy';
import { rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
async function main() {
  if (process.argv.length !== 2 || process.env.APP_ENV !== 'test')
    throw new Error('verification_target_invalid');
  const project = await createProcessProject();
  let database: Awaited<ReturnType<typeof allocateTestDatabase>> | undefined;
  let proxy: Awaited<ReturnType<typeof databaseProxy>> | undefined;
  let cleanupFailed: boolean;
  let applied: number;
  try {
    await rm(join(project.root, 'node_modules'), {
      recursive: true,
      force: true,
    });
    // Bootstrap with npm itself: a clean directory cannot import tsx yet.
    await project.command(
      [
        resolve(
          dirname(process.execPath),
          '../lib/node_modules/npm/bin/npm-cli.js',
        ),
        'ci',
      ],
      { NODE_ENV: 'development' },
      180000,
    );
    await project.command(['--run', 'build'], {}, 180000);
    database = await allocateTestDatabase({ purpose: 'migration-under-test' });
    const migrated = await project.command(['dist/migrate.mjs'], {
      APP_ENV: 'test',
      MIGRATION_DATABASE_URL: database.connectionString,
    });
    applied = JSON.parse(migrated.output()).applied;
    if (applied !== acceptedMigrations.length)
      throw new Error('verification_migration_failed');
    proxy = await databaseProxy(database.connectionString);
    const port = await availablePort();
    const child = project.run(['dist/server.mjs'], {
      APP_ENV: 'test',
      PORT: String(port),
      DATABASE_URL: proxy.connectionString,
    });
    const probe = async (path: string) => {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/${path}`,
        { signal: AbortSignal.timeout(2200) },
      );
      if (!response.headers.get('cache-control')?.includes('no-store'))
        throw new Error('verification_cached_probe');
      return {
        status: response.status,
        body: (await response.json()) as { status: string; timestamp: string },
      };
    };
    await eventually(
      () => probe('ready'),
      (r) => r.status === 200,
      60000,
    );
    const first = await probe('live');
    const ready = await probe('ready');
    const second = await probe('live');
    if (
      first.status !== 200 ||
      ready.status !== 200 ||
      first.body.timestamp === second.body.timestamp
    )
      throw new Error('verification_probe_failed');
    await proxy.stop();
    const started = performance.now();
    const outage = await probe('ready');
    if (
      outage.status !== 503 ||
      performance.now() - started > 2200 ||
      (await probe('live')).status !== 200
    )
      throw new Error('verification_outage_failed');
    await proxy.start();
    await eventually(
      () => probe('ready'),
      (r) => r.status === 200,
      5000,
    );
    if ((await project.stop(child)) !== 0 || !(await portIsFree(port)))
      throw new Error('verification_shutdown_failed');
  } finally {
    const cleanup = await Promise.allSettled([
      project.dispose(),
      proxy?.stop(),
      database?.dispose(),
    ]);
    cleanupFailed = cleanup.some((result) => result.status === 'rejected');
  }
  if (cleanupFailed) throw new Error('verification_cleanup_failed');
  console.log(
    JSON.stringify({
      event: 'foundation_verified',
      cleanInstall: true,
      migrated: applied,
      live: 200,
      ready: 200,
      outageReady: 503,
      recovered: 200,
      stopped: true,
    }),
  );
}
void main().catch(() => {
  console.error('foundation_verification_failed');
  process.exitCode = 1;
});
