import { acceptedMigrations } from '../helpers/migration-chain';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('ships a non-root PID1 Node entrypoint with compiled migration and ordinary Next output', () => {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(
      execFileSync(
        'docker',
        [
          'image',
          'inspect',
          'my-new-system-foundation:local',
          '--format',
          '{{json .Config}}',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
      ).toString(),
    );
  } catch {
    /* Missing image must fail this assertion. */
  }
  expect(config.User).toBe('1000:1000');
  expect(config.Cmd).toEqual(['node', 'dist/server.mjs']);
  const result = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--entrypoint',
      'node',
      'my-new-system-foundation:local',
      '--input-type=module',
      '-e',
      `import{existsSync,readFileSync}from'node:fs';console.log(JSON.stringify({server:existsSync('dist/server.mjs'),migrate:existsSync('dist/migrate.mjs'),next:existsSync('.next/BUILD_ID'),manifest:JSON.parse(readFileSync('dist/migration-manifest.json','utf8')),secrets:existsSync('.env.local')||existsSync('.local')||existsSync('docs')||existsSync('.git')}))`,
    ],
    { timeout: 20000 },
  ).toString();
  expect(JSON.parse(result)).toEqual({
    server: true,
    migrate: true,
    next: true,
    manifest: acceptedMigrations,
    secrets: false,
  });
});

it('serves migrated readiness through the Compose bridge profile and delivers SIGTERM to PID1', async () => {
  const { allocateTestDatabase } = await import('../helpers/test-database');
  const { runMigrations } = await import('../../scripts/migrate');
  const { availablePort, eventually, portIsFree } =
    await import('../helpers/process');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { parse, stringify } = await import('yaml');
  const lease = await allocateTestDatabase({ purpose: 'migration-under-test' });
  const root = await mkdtemp(join(tmpdir(), 'foundation-container-'));
  const name = 'foundation-smoke-' + lease.name.slice(-20);
  const file = join(root, 'compose.yaml');
  const composeArgs = [
    'compose',
    '--project-name',
    name,
    '--file',
    file,
    '--profile',
    'app',
  ];
  let created = false;
  try {
    await runMigrations({
      environment: 'test',
      migrationDatabaseUrl: lease.connectionString,
    });
    const port = await availablePort();
    const runtime = join(root, 'runtime.env');
    const url = new URL(lease.connectionString);
    url.hostname = 'test-db';
    url.port = '5432';
    await writeFile(runtime, `APP_ENV=test\nDATABASE_URL=${url.toString()}\n`, {
      mode: 0o600,
    });
    const canonical = parse(await readFile('compose.yaml', 'utf8'));
    expect(canonical.services.app.env_file[0].path).toBe(
      '.env.container.local',
    );
    const app = {
      ...canonical.services.app,
      build: { context: process.cwd() },
      container_name: name,
      env_file: [runtime],
      depends_on: {},
      ports: [`127.0.0.1:${port}:3000`],
    };
    // Retain the real app profile and bridge settings; only point its DB at the
    // existing dedicated test service. This project creates no DB or volume.
    await writeFile(
      file,
      stringify({
        services: { app },
        networks: {
          development: {
            external: true,
            name: 'my-new-system-foundation_test',
          },
        },
      }),
    );
    created = true;
    execFileSync(
      'docker',
      [...composeArgs, 'up', '--detach', '--no-build', 'app'],
      { stdio: 'ignore', timeout: 15000 },
    );
    await eventually(
      async () => {
        const r = await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`, {
          signal: AbortSignal.timeout(2200),
        });
        return r.status;
      },
      (n) => n === 200,
      60000,
    );
    const live = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
    expect(live.status).toBe(200);
    expect(live.headers.get('cache-control')).toContain('no-store');
    execFileSync('docker', [...composeArgs, 'stop', 'app'], {
      stdio: 'ignore',
      timeout: 40000,
    });
    expect(
      execFileSync(
        'docker',
        ['inspect', name, '--format', '{{.State.ExitCode}}'],
        { timeout: 5000 },
      )
        .toString()
        .trim(),
    ).toBe('0');
    expect(await portIsFree(port)).toBe(true);
  } finally {
    try {
      if (created)
        execFileSync('docker', [...composeArgs, 'down'], {
          stdio: 'ignore',
          timeout: 40000,
        });
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        lease.dispose(),
      ]);
    }
  }
}, 120000);

it('keeps the build-context canary and local credential paths out of every exported image layer', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'foundation-layers-'));
  try {
    const archive = join(root, 'image.tar');
    execFileSync(
      'docker',
      ['save', '--output', archive, 'my-new-system-foundation:local'],
      { timeout: 60000 },
    );
    const inspected = execFileSync(
      'python3',
      [
        '-c',
        `
import tarfile,json,sys
marker=b'foundation-build-context-canary-703b2a1d'
layers=0
with tarfile.open(sys.argv[1]) as outer:
 manifest=json.load(outer.extractfile('manifest.json'))
 for name in manifest[0]['Layers']:
  layers+=1
  with tarfile.open(fileobj=outer.extractfile(name),mode='r|*') as layer:
   for item in layer:
    path=item.name.lstrip('./')
    if path.startswith(('app/.env','app/.local/','app/.git/','app/docs/')): raise RuntimeError('forbidden_layer_path')
    if item.isfile():
     f=layer.extractfile(item);tail=b''
     while True:
      chunk=f.read(1048576)
      if not chunk:break
      data=tail+chunk
      if marker in data:raise RuntimeError('canary_in_image_layer')
      tail=data[-len(marker):]
print(json.dumps({'clean':True,'layers':layers}))
`,
        archive,
      ],
      { encoding: 'utf8', timeout: 60000 },
    );
    expect(JSON.parse(inspected)).toMatchObject({ clean: true });
    expect(JSON.parse(inspected).layers).toBeGreaterThan(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 130000);
