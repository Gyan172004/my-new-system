import { unauthorized, type TokenVerifier } from '../application/types';
export function createTestVerifier(environment: string): TokenVerifier {
  if (environment !== 'development' && environment !== 'test')
    throw new Error('test_identity_forbidden');
  return {
    async verify(token) {
      const subject =
        token === 'test_alice'
          ? 'alice'
          : token === 'test_bob'
            ? 'bob'
            : undefined;
      if (!subject) throw unauthorized();
      return Object.freeze({
        provider: 'test',
        issuer: 'test://local',
        subject,
      });
    },
  };
}
