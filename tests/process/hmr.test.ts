import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  availablePort,
  createProcessProject,
  eventually,
  portIsFree,
  readLiveness,
} from '../helpers/process';
it('preserves bootstrap resource identity and one listener across two real Next reloads', async () => {
  const project = await createProcessProject();
  const port = await availablePort();
  try {
    await project.instrument();
    // Execute the actual npm dev script; no watcher restarts the custom entrypoint.
    const npm = join(
      process.execPath,
      '../../lib/node_modules/npm/bin/npm-cli.js',
    );
    const child = project.run([npm, 'run', 'dev'], {
      APP_ENV: 'development',
      DATABASE_URL: 'postgresql://unreachable.invalid/foundation',
      PORT: String(port),
    });
    await eventually(
      () => readLiveness(port),
      (value) => value.status === 200,
      120000,
    );
    const baseline = await project.observation();
    expect(baseline).toMatchObject({
      calls: 1,
      listeners: 1,
      sameHandle: true,
      lifecycle: 'SERVING',
    });
    const health = join(project.root, 'src/server/health.ts');
    const original = await readFile(health, 'utf8');
    for (const timestamp of [
      '2026-10-18T00:00:01.000Z',
      '2026-10-18T00:00:02.000Z',
    ]) {
      await writeFile(
        health,
        original.replace('new Date().toISOString()', JSON.stringify(timestamp)),
      );
      await eventually(
        () => readLiveness(port),
        (value) => value.status === 200 && value.body.timestamp === timestamp,
        30000,
      );
      const current = await project.observation();
      expect(current).toEqual(baseline);
      expect(await portIsFree(port)).toBe(false);
      expect(child.child.exitCode).toBeNull();
    }
    await project.stop(child);
    expect(await portIsFree(port)).toBe(true);
  } finally {
    await project.dispose();
  }
}, 240000);
