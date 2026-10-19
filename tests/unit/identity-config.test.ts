import { generateKeyPairSync } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseBuildConfig, parseRuntimeConfig } from '../../src/server/config';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const base = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/foundation',
  IDENTITY_ADAPTER: 'clerk',
  CLERK_ISSUER: 'https://clerk.example',
  CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000,https://practice.example',
  CLERK_PUBLISHABLE_KEY:
    'pk_test_' +
    Buffer.from('clerk.example$').toString('base64').replace(/=/g, ''),
  CLERK_JWT_KEY: pem,
};

it('enables Clerk only with a complete runtime-only verification configuration', () => {
  const config = parseRuntimeConfig(base);
  expect(config.identityAdapter).toBe('clerk');
  expect(config).toMatchObject({
    clerk: {
      issuer: 'https://clerk.example',
      authorizedParties: ['http://localhost:3000', 'https://practice.example'],
      jwtKey: pem,
      publishableKey: base.CLERK_PUBLISHABLE_KEY,
    },
  });
  expect(Object.isFrozen(config.clerk)).toBe(true);
  expect(Object.isFrozen(config.clerk?.authorizedParties)).toBe(true);
  expect(parseBuildConfig({})).toEqual({ phase: 'build' });
});

it.each([
  'CLERK_ISSUER',
  'CLERK_AUTHORIZED_PARTIES',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_JWT_KEY',
])('rejects incomplete Clerk mode using only the setting name: %s', (key) => {
  for (const value of [undefined, '']) {
    expect(() => parseRuntimeConfig({ ...base, [key]: value })).toThrow(key);
  }
});

it.each([
  ['CLERK_ISSUER', 'http://clerk.example'],
  ['CLERK_ISSUER', 'https://clerk.example/path'],
  ['CLERK_ISSUER', 'https://user:password@clerk.example'],
  ['CLERK_AUTHORIZED_PARTIES', '*'],
  ['CLERK_AUTHORIZED_PARTIES', 'https://practice.example/path'],
  ['CLERK_AUTHORIZED_PARTIES', 'https://practice.example,'],
  ['CLERK_AUTHORIZED_PARTIES', 'http://remote.example'],
  ['CLERK_JWT_KEY', 'CANARY_INVALID_PEM'],
  ['CLERK_AUDIENCE', ''],
  ['CLERK_PUBLISHABLE_KEY', 'pk_test_invalid'],
])('rejects invalid %s without leaking its value', (key, value) => {
  try {
    parseRuntimeConfig({ ...base, [key]: value });
    expect.fail('configuration must reject');
  } catch (error) {
    expect(String(error)).toContain(key);
    if (value) expect(String(error)).not.toContain(value);
  }
});

it('refuses private keys and unsupported signing keys even when importable', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  for (const key of [
    rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ec.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  ]) {
    expect(() => parseRuntimeConfig({ ...base, CLERK_JWT_KEY: key })).toThrow(
      'CLERK_JWT_KEY',
    );
  }
});

it('keeps foundation-only mode valid and rejects local test identity remotely', () => {
  expect(
    parseRuntimeConfig({
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://db.invalid/foundation?sslmode=verify-full',
    }).identityAdapter,
  ).toBe('disabled');
  for (const APP_ENV of ['staging', 'production']) {
    expect(() =>
      parseRuntimeConfig({ ...base, APP_ENV, IDENTITY_ADAPTER: 'test' }),
    ).toThrow('IDENTITY_ADAPTER');
  }
  expect(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: base.DATABASE_URL,
      CLERK_JWT_KEY: 'UNUSED_CANARY',
    }).clerk,
  ).toBeUndefined();
});

it('rejects concatenated key blocks and trailing content instead of retaining private material', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const suffix of [
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    pem,
    'CANARY_TRAILING_DATA',
  ]) {
    expect(() =>
      parseRuntimeConfig({ ...base, CLERK_JWT_KEY: pem + suffix }),
    ).toThrow('CLERK_JWT_KEY');
  }
});

it('requires HTTPS parties remotely and a live publishable key in production', () => {
  const remote = {
    ...base,
    APP_ENV: 'production',
    DATABASE_URL: 'postgresql://db.invalid/foundation?sslmode=verify-full',
  };
  expect(() => parseRuntimeConfig(remote)).toThrow('CLERK_AUTHORIZED_PARTIES');
  expect(() =>
    parseRuntimeConfig({
      ...remote,
      CLERK_AUTHORIZED_PARTIES: 'https://practice.example',
    }),
  ).toThrow('CLERK_PUBLISHABLE_KEY');
});
