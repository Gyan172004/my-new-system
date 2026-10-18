import { expect, it, vi } from 'vitest';
import {
  GET,
  dynamic,
  runtime as routeRuntime,
} from '../../src/app/api/v1/health/live/route';
import { installRuntime } from '../../src/server/runtime';
import { parseRuntimeConfig } from '../../src/server/config';

it('serves unauthenticated canonical uncached process liveness through the installed registry', async () => {
  const owned = installRuntime(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unreachable.invalid/app',
    }),
  );
  // Fail immediately if health tries to acquire storage or provider resources.
  const guarded = vi.spyOn(owned, 'getOrCreate').mockImplementation(() => {
    throw new Error('dependency_access_disallowed');
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T00:00:00.000Z'));
  try {
    const first = await GET();
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('set-cookie')).toBeNull();
    expect(await first.json()).toEqual({
      status: 'ok',
      timestamp: '2026-10-18T00:00:00.000Z',
    });
    vi.setSystemTime(new Date('2026-10-18T00:00:01.000Z'));
    expect(await (await GET()).json()).toEqual({
      status: 'ok',
      timestamp: '2026-10-18T00:00:01.000Z',
    });
    expect(dynamic).toBe('force-dynamic');
    expect(routeRuntime).toBe('nodejs');
  } finally {
    guarded.mockRestore();
    vi.useRealTimers();
  }
});
