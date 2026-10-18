import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readiness } from '../../../../../server/health';
import { getRuntime } from '../../../../../server/runtime';
import { runtimeDatabase } from '../../../../../server/database';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(): Promise<Response> {
  const registry = getRuntime();
  try {
    const expected: unknown = JSON.parse(
      await readFile(resolve('dist/migration-manifest.json'), 'utf8'),
    );
    if (
      !Array.isArray(expected) ||
      !expected.every((name) => typeof name === 'string')
    )
      throw new Error('manifest_unavailable');
    const report = await readiness({
      state: () => registry.state,
      expected,
      deadlineMs: registry.config.readinessTimeoutMs,
      check: (signal) => runtimeDatabase(registry).observe(signal),
    });
    return Response.json(report.body, {
      status: report.httpStatus,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      {
        status: 'unavailable',
        timestamp: new Date().toISOString(),
        checks: { application: 'unavailable' },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
