import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { parseRuntimeConfig } from '../../src/server/config';
import { expect, it } from 'vitest';
import { fixtureClerk, signedSession } from '../helpers/identity-tokens';
import { createClerkVerifier } from '../../src/modules/identity-profile/adapters/clerk-verifier';
import { createAuthenticator } from '../../src/modules/identity-profile/application/authenticate';
import { createAdmission } from '../../src/modules/identity-profile/application/admission';
import { createTestVerifier } from '../../src/modules/identity-profile/adapters/test-verifier';
import { safeReturnPath } from '../../src/modules/identity-profile/application/redirect';

it('verifies signed sessions using either supported configured public-key encoding', async () => {
  const publicKey = createPublicKey(fixtureClerk.jwtKey);
  for (const type of ['spki', 'pkcs1'] as const) {
    const config = parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/test',
      IDENTITY_ADAPTER: 'clerk',
      CLERK_ISSUER: fixtureClerk.issuer,
      CLERK_AUTHORIZED_PARTIES: fixtureClerk.authorizedParties.join(','),
      CLERK_PUBLISHABLE_KEY: fixtureClerk.publishableKey,
      CLERK_SECRET_KEY: fixtureClerk.secretKey,
      CLERK_JWT_KEY: publicKey.export({ type, format: 'pem' }).toString(),
    });
    expect(
      await createClerkVerifier(config.clerk!).verify(signedSession()),
    ).toMatchObject({ subject: 'user_alice' });
  }
});

it('applies the verified-identity budget before mapping a repeated valid caller', async () => {
  let mappings = 0;
  const authenticate = createAuthenticator({
    mode: 'clerk',
    verifier: createClerkVerifier(fixtureClerk),
    admission: createAdmission({
      identity: { capacity: 1, refillPerMinute: 1 },
    }),
    resolveUser: async () => {
      mappings++;
      return { id: 'internal-alice', status: 'active' };
    },
  });
  await authenticate({
    authorization: 'Bearer ' + signedSession(),
    sourceAddress: '127.0.0.1',
  });
  await expect(
    authenticate({
      authorization: 'Bearer ' + signedSession(),
      sourceAddress: '127.0.0.2',
    }),
  ).rejects.toMatchObject({ status: 429 });
  expect(mappings).toBe(1);
});

it('verifies actual RSA signatures with the SDK and returns only verified identity', async () => {
  const verifier = createClerkVerifier(fixtureClerk);
  expect(await verifier.verify(signedSession())).toEqual({
    provider: 'clerk',
    issuer: fixtureClerk.issuer,
    subject: 'user_alice',
  });
  expect(await verifier.verify(signedSession({ sts: 'active' }))).toMatchObject(
    { subject: 'user_alice' },
  );
});
it.each([
  { sub: undefined },
  { sub: '' },
  { sub: 'x'.repeat(257) },
  { sub: 'user bad' },
  { sid: undefined },
  { sid: '' },
  { sid: 'x'.repeat(257) },
  { iss: 'https://other.example' },
  { iss: undefined },
  { azp: undefined },
  { azp: 'https://other.example' },
  { exp: 1 },
  { exp: undefined },
  { exp: 'tomorrow' },
  { nbf: Math.floor(Date.now() / 1000) + 300 },
  { nbf: undefined },
  { iat: undefined },
  { iat: Math.floor(Date.now() / 1000) + 300 },
  { sts: 'pending' },
  { sts: 'unknown' },
  { sts: null },
])(
  'rejects signed invalid session claims without leaking them: %j',
  async (claims) => {
    await expect(
      createClerkVerifier(fixtureClerk).verify(signedSession(claims)),
    ).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
  },
);
it.each([{ alg: 'none' }, { alg: 'HS256' }, { typ: 'other' }])(
  'rejects signed unsupported headers: %j',
  async (header) => {
    await expect(
      createClerkVerifier(fixtureClerk).verify(signedSession({}, header)),
    ).rejects.toMatchObject({ status: 401 });
  },
);
it('rejects forged, malformed and oversized credentials; enforces configured audience presence', async () => {
  const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const verifier = createClerkVerifier({
    ...fixtureClerk,
    audience: 'interview',
  });
  for (const token of [
    'garbage',
    'a.b.c',
    'x'.repeat(8193),
    signedSession({}, {}, foreign.privateKey),
    signedSession(),
    signedSession({ aud: 'other' }),
  ]) {
    await expect(verifier.verify(token)).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  }
  expect(
    await verifier.verify(signedSession({ aud: ['other', 'interview'] })),
  ).toMatchObject({ subject: 'user_alice' });
});
it('maps only verified/admitted callers and sanitizes storage failures', async () => {
  const seen: string[] = [];
  const authenticate = createAuthenticator({
    mode: 'clerk',
    verifier: createClerkVerifier(fixtureClerk),
    admission: createAdmission(),
    resolveUser: async (identity) => {
      seen.push(identity.subject);
      return { id: 'internal-alice', status: 'active' };
    },
  });
  const caller = await authenticate({
    authorization: 'Bearer ' + signedSession(),
    sourceAddress: '127.0.0.1',
  });
  expect(caller).toEqual({ userId: 'internal-alice' });
  expect(Object.isFrozen(caller)).toBe(true);
  for (const authorization of [
    undefined,
    '',
    'Basic abc',
    'Bearer a,b',
    'Bearer a b',
    'Bearer invalid',
  ]) {
    await expect(
      authenticate({ authorization, sourceAddress: '127.0.0.2' }),
    ).rejects.toMatchObject({ status: 401 });
  }
  expect(seen).toEqual(['user_alice']);
  const failed = createAuthenticator({
    mode: 'clerk',
    verifier: createClerkVerifier(fixtureClerk),
    admission: createAdmission(),
    resolveUser: async () => {
      throw new Error('CANARY_DB_PASSWORD');
    },
  });
  await expect(
    failed({
      authorization: 'Bearer ' + signedSession(),
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 503, code: 'identity_unavailable' });
  try {
    await failed({
      authorization: 'Bearer ' + signedSession(),
      sourceAddress: '127.0.0.1',
    });
  } catch (error) {
    expect(String(error)).not.toContain('CANARY_DB_PASSWORD');
    expect(JSON.stringify(error)).not.toContain('CANARY_DB_PASSWORD');
  }
});
it('denies disabled users, aborted work and disabled mode with no fallback', async () => {
  const verifier = createClerkVerifier(fixtureClerk);
  const admission = createAdmission();
  let mapped = 0;
  const resolveUser = async () => {
    mapped++;
    return { id: 'internal-alice', status: 'disabled' as const };
  };
  const authenticate = createAuthenticator({
    mode: 'clerk',
    verifier,
    admission,
    resolveUser,
  });
  await expect(
    authenticate({
      authorization: 'Bearer ' + signedSession(),
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 403 });
  const abort = new AbortController();
  abort.abort();
  await expect(
    authenticate({
      authorization: 'Bearer ' + signedSession(),
      sourceAddress: '127.0.0.1',
      signal: abort.signal,
    }),
  ).rejects.toMatchObject({ status: 503 });
  const disabled = createAuthenticator({
    mode: 'disabled',
    verifier,
    admission,
    resolveUser,
  });
  await expect(
    disabled({
      authorization: 'Bearer ' + signedSession(),
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(mapped).toBe(1);
});
it('admits before verification and before mapping, without fake success on outage', async () => {
  let verified = 0,
    mapped = 0;
  const admission = createAdmission({
    global: { capacity: 1, refillPerMinute: 1 },
  });
  const authenticate = createAuthenticator({
    mode: 'test',
    admission,
    verifier: {
      verify: async () => {
        verified++;
        return { provider: 'test', issuer: 'test://local', subject: 'alice' };
      },
    },
    resolveUser: async () => {
      mapped++;
      return { id: 'alice', status: 'active' };
    },
  });
  await authenticate({
    authorization: 'Bearer test_alice',
    sourceAddress: '127.0.0.1',
  });
  await expect(
    authenticate({
      authorization: 'Bearer test_alice',
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 429 });
  expect([verified, mapped]).toEqual([1, 1]);
  await admission.close();
  await expect(
    authenticate({
      authorization: 'Bearer test_alice',
      sourceAddress: '127.0.0.1',
    }),
  ).rejects.toMatchObject({ status: 503 });
});
it('test adapter is explicitly local and cannot verify Clerk or arbitrary header identities', async () => {
  for (const env of ['staging', 'production'])
    expect(() => createTestVerifier(env)).toThrow();
  const verifier = createTestVerifier('test');
  expect(await verifier.verify('test_alice')).toEqual({
    provider: 'test',
    issuer: 'test://local',
    subject: 'alice',
  });
  for (const value of ['test_eve', 'Bearer test_alice', signedSession()])
    await expect(verifier.verify(value)).rejects.toMatchObject({ status: 401 });
});
it.each([
  'https://evil.example',
  '//evil.example',
  '/\\evil',
  '/%2f%2fevil',
  '/../evil',
  '/sign-in',
  '/?next=//evil',
  '/sessions/nope',
])('replaces non-allowlisted return destination %s', (value) =>
  expect(safeReturnPath(value)).toBe('/'),
);
it('preserves only allowed candidate navigation targets', () => {
  for (const value of [
    '/',
    '/problems',
    '/problems/two-sum',
    '/sessions',
    '/sessions/00000000-0000-4000-8000-000000000001',
  ])
    expect(safeReturnPath(value)).toBe(value);
  expect(safeReturnPath(undefined)).toBe('/');
});
