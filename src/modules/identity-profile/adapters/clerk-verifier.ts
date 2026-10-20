import { verifyToken } from '@clerk/backend';
import type { ClerkRuntimeConfig } from '../../../server/config';
import { unauthorized, type TokenVerifier } from '../application/types';
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_:-]{1,256}$/.test(value);
const integerTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function createClerkVerifier(
  settings: ClerkRuntimeConfig,
): TokenVerifier {
  return {
    async verify(token) {
      try {
        if (
          Buffer.byteLength(token) > 8192 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
        )
          throw unauthorized();
        const header = JSON.parse(
          Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'),
        ) as Record<string, unknown>;
        if (header.alg !== 'RS256' || header.typ !== 'JWT')
          throw unauthorized();
        const claims = await verifyToken(token, {
          jwtKey: settings.jwtKey,
          issuer: settings.issuer,
          authorizedParties: [...settings.authorizedParties],
          clockSkewInMs: 0,
          headerType: 'JWT',
          ...(settings.audience ? { audience: settings.audience } : {}),
        });
        const now = Math.floor(Date.now() / 1000);
        if (
          !identifier(claims.sub) ||
          !identifier(claims.sid) ||
          claims.iss !== settings.issuer ||
          typeof claims.azp !== 'string' ||
          !settings.authorizedParties.includes(claims.azp) ||
          !integerTime(claims.exp) ||
          !integerTime(claims.nbf) ||
          !integerTime(claims.iat) ||
          claims.exp <= now ||
          claims.nbf > now ||
          claims.iat > now ||
          claims.exp <= claims.iat ||
          (claims.sts !== undefined && claims.sts !== 'active')
        )
          throw unauthorized();
        if (settings.audience) {
          const audiences: unknown[] = Array.isArray(claims.aud)
            ? claims.aud
            : [claims.aud];
          if (
            !audiences.every((value) => typeof value === 'string') ||
            !audiences.includes(settings.audience)
          )
            throw unauthorized();
        }
        return Object.freeze({
          provider: 'clerk',
          issuer: settings.issuer,
          subject: claims.sub,
        });
      } catch {
        // SDK/JWT errors may contain claims or tokens. Never retain their message/cause.
        throw unauthorized();
      }
    },
  };
}
