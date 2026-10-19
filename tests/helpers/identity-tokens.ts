import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { ClerkRuntimeConfig } from '../../src/server/config';

// Ephemeral synthetic fixture keys; these never establish live Clerk acceptance.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const fixtureClerk: ClerkRuntimeConfig = Object.freeze({
  issuer: 'https://clerk.example',
  authorizedParties: Object.freeze(['http://localhost:3000']),
  publishableKey:
    'pk_test_' + Buffer.from('clerk.example$').toString('base64url'),
  jwtKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  audience: undefined,
});
export function signedSession(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  key: KeyObject = keys.privateKey,
) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned =
    encode({ alg: 'RS256', typ: 'JWT', kid: 'synthetic_key', ...header }) +
    '.' +
    encode({
      iss: fixtureClerk.issuer,
      sub: 'user_alice',
      sid: 'sess_alice',
      azp: 'http://localhost:3000',
      iat: now - 1,
      nbf: now - 1,
      exp: now + 60,
      ...claims,
    });
  return (
    unsigned +
    '.' +
    sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')
  );
}
