import { expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { runContentCommand } from '../../../scripts/content-pack';
import { createApprovedPack } from '../../fixtures/problem-catalogue';
const raw = JSON.stringify(createApprovedPack());
it('validates an unsigned offline draft without runtime identity or external calls', async () => {
  const p = createApprovedPack();
  p.authorId = null as never;
  const result = (await runContentCommand(['validate', 'pack.json'], {
    stdin: Readable.from([]),
    read: async () => Buffer.from(JSON.stringify(p)),
  })) as { ok: boolean; publishable: boolean; checksum: string };
  expect(result?.ok).toBe(true);
  expect(result.publishable).toBe(false);
  expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
});
it.each(
  [
    ['publish', 'pack', 'review', '--userId', 'claimed'],
    ['review', 'pack', 'evidence', '--approved'],
    ['validate'],
    ['unknown', 'pack'],
  ].map((args) => ({ args })),
)(
  'rejects undeclared positional or identity/approval arguments %j',
  async ({ args }) => {
    await expect(
      runContentCommand(args, {
        stdin: Readable.from([]),
        read: async () => Buffer.from(raw),
      }),
    ).rejects.toMatchObject({ code: 'invalid_command' });
  },
);
it('rejects missing, oversized, multiline or already-aborted credentials before obtaining services', async () => {
  for (const credential of ['', 'x'.repeat(8193), 'one\ntwo'])
    await expect(
      runContentCommand(
        ['publish', 'pack', '11111111-1111-4111-8111-111111111111'],
        {
          stdin: Readable.from([credential]),
          read: async () => Buffer.from(raw),
        },
      ),
    ).rejects.toMatchObject({ code: 'invalid_operator_credential' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    runContentCommand(['validate', 'pack'], {
      stdin: Readable.from([]),
      read: async () => Buffer.from(raw),
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: 'command_cancelled' });
});
it('bounds pack bytes and evidence bytes without returning private content', async () => {
  await expect(
    runContentCommand(['validate', 'pack'], {
      stdin: Readable.from([]),
      read: async () => Buffer.alloc(2097153, 120),
    }),
  ).rejects.toMatchObject({ code: 'input_too_large' });
  await expect(
    runContentCommand(['review', 'pack', 'evidence'], {
      stdin: Readable.from(['synthetic-token\n']),
      read: async (path: string) =>
        Buffer.from(path === 'pack' ? raw : 'x'.repeat(16385)),
    }),
  ).rejects.toMatchObject({ code: 'input_too_large' });
});
it('actual CLI process validates a draft and hides private malformed content/credentials on stderr', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'catalogue-cli-'));
  try {
    const file = join(dir, 'pack.json');
    await writeFile(file, raw);
    const valid = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/content-pack.ts', 'validate', file],
      { encoding: 'utf8', timeout: 10000 },
    );
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({
      ok: true,
      publishable: true,
    });
    await writeFile(file, '{"private-content-canary":');
    const invalid = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/content-pack.ts', 'validate', file],
      { encoding: 'utf8', timeout: 10000 },
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stdout + invalid.stderr).not.toContain(
      'private-content-canary',
    );
    const denied = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/content-pack.ts',
        'publish',
        file,
        '--token',
        'private-credential-canary',
      ],
      { encoding: 'utf8', timeout: 10000, input: 'private-stdin-canary' },
    );
    expect(denied.status).toBe(1);
    expect(denied.stderr).toBe('invalid_command\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
