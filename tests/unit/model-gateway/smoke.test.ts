import { afterEach, expect, it, vi } from 'vitest';
import {
  parseSmokeArguments,
  runSmoke,
} from '../../../scripts/model-gateway-smoke';
afterEach(() => vi.restoreAllMocks());
it('requires explicit supported adapter with a fixed fixture and bounded default', () => {
  expect(() => parseSmokeArguments([])).toThrow('invalid_smoke_arguments');
  expect(parseSmokeArguments(['--adapter', 'fake'])).toEqual({
    adapter: 'fake',
    fixture: 'gateway-probe-v1',
    count: 1,
  });
  expect(
    parseSmokeArguments([
      '--adapter',
      'groq',
      '--count',
      '5',
      '--fixture',
      'gateway-probe-v1',
    ]),
  ).toMatchObject({ adapter: 'groq', count: 5 });
});
it.each(
  [
    ['--adapter', 'disabled'],
    ['--adapter', 'arbitrary'],
    ['--adapter', 'fake', '--count', '0'],
    ['--adapter', 'fake', '--count', '6'],
    ['--adapter', 'fake', '--count', '1.5'],
    ['--adapter', 'fake', '--count', 'Infinity'],
    ['--adapter', 'fake', '--count', '01'],
    ['--adapter', 'fake', '--fixture', 'CANARY_PAYLOAD'],
    ['--adapter', 'fake', '--text', 'CANARY'],
    ['--adapter', 'fake', '--api-key', 'CANARY'],
    ['--adapter', 'fake', '--adapter', 'openai'],
    ['--adapter'],
    ['--adapter', 'fake', '--count'],
  ].map((args) => ({ args })),
)('rejects unsupported or unbounded CLI arguments $args', ({ args }) => {
  expect(() => parseSmokeArguments(args)).toThrow('invalid_smoke_arguments');
});
it('runs five sequential calls, summarizes safe metadata only, and never requires storage config', async () => {
  const lines: string[] = [];
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('CANARY_NETWORK'));
  expect(
    await runSmoke(
      ['--adapter', 'fake', '--count', '5'],
      { APP_ENV: 'test', OPENAI_API_KEY: 'CANARY_UNUSED' },
      {
        signal: new AbortController().signal,
        write: (line) => lines.push(line),
      },
    ),
  ).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(lines).toHaveLength(5);
  const rows = lines.map((line) => JSON.parse(line));
  expect(
    rows.every(
      (row) =>
        row.outcome === 'success' &&
        row.attempts === 1 &&
        row.fixture === 'gateway-probe-v1',
    ),
  ).toBe(true);
  expect(lines.join('')).not.toMatch(
    /CANARY|Synthetic gateway probe|acknowledged|apiKey|headers|body/,
  );
});
it('bounds retrying provider runs to ten attempts with concurrency one', async () => {
  let attempts = 0;
  let active = 0;
  let maximum = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    attempts++;
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return Response.json(
      { error: { code: 'server_error', message: 'CANARY_PRIVATE' } },
      { status: 503 },
    );
  });
  const lines: string[] = [];
  expect(
    await runSmoke(
      ['--adapter', 'groq', '--count', '5'],
      { APP_ENV: 'development', GROQ_API_KEY: 'dummy-CANARY' },
      {
        signal: new AbortController().signal,
        write: (line) => lines.push(line),
      },
    ),
  ).toBe(1);
  expect(attempts).toBe(10);
  expect(maximum).toBe(1);
  expect(
    lines
      .map((line) => JSON.parse(line))
      .every(
        (row) => row.attempts === 2 && row.outcome === 'provider_unavailable',
      ),
  ).toBe(true);
  expect(lines.join('')).not.toContain('CANARY');
}, 10000);
it('cancels active provider work without starting another logical call', async () => {
  const abort = new AbortController();
  let calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    calls++;
    abort.abort('CANARY_CANCEL');
    return new Promise(() => {});
  });
  const lines: string[] = [];
  expect(
    await runSmoke(
      ['--adapter', 'groq', '--count', '5'],
      { APP_ENV: 'development', GROQ_API_KEY: 'dummy' },
      { signal: abort.signal, write: (line) => lines.push(line) },
    ),
  ).toBe(1);
  expect(calls).toBe(1);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({
    outcome: 'cancelled',
    attempts: 1,
  });
});
it('rejects prohibited provider environments before transport and sanitizes faults', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('CANARY_FAULT'));
  for (const APP_ENV of ['test', 'staging', 'production'])
    await expect(
      runSmoke(
        ['--adapter', 'groq'],
        { APP_ENV, GROQ_API_KEY: 'dummy' },
        { signal: new AbortController().signal, write() {} },
      ),
    ).rejects.toThrow('MODEL_GATEWAY_ADAPTER');
  expect(fetch).not.toHaveBeenCalled();
});
