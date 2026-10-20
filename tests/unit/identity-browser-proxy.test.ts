import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest, type NextFetchEvent } from 'next/server';
import { fixtureClerk } from '../helpers/identity-tokens';

afterEach(() => vi.unstubAllEnvs());
it('serves a signed-out sign-in request with the validated single runtime key and no dynamic-key encryption setting', async () => {
  for (const [key, value] of Object.entries({
    APP_ENV: 'test',
    CLERK_TELEMETRY_DISABLED: '1',
    DATABASE_URL: 'postgresql://localhost/foundation',
    IDENTITY_ADAPTER: 'clerk',
    CLERK_ISSUER: fixtureClerk.issuer,
    CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000',
    CLERK_PUBLISHABLE_KEY: fixtureClerk.publishableKey,
    CLERK_SECRET_KEY: fixtureClerk.secretKey,
    CLERK_JWT_KEY: fixtureClerk.jwtKey,
  }))
    vi.stubEnv(key, value);
  vi.stubEnv('CLERK_ENCRYPTION_KEY', undefined);
  const { identityBrowserProxy } =
    await import('../../src/modules/identity-browser/adapters/proxy');
  const response = await identityBrowserProxy(
    new NextRequest('http://localhost:3000/sign-in'),
    { waitUntil: () => undefined } as unknown as NextFetchEvent,
  );
  expect(response?.status).toBe(200);
  expect(response?.headers.get('Cache-Control')).toBe('no-store');
  expect(await response?.text()).not.toContain(fixtureClerk.secretKey);
});
