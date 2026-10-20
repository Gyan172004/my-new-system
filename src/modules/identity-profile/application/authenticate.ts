import type { createAdmission } from './admission';
import {
  IdentityFailure,
  unauthorized,
  unavailable,
  type TokenVerifier,
  type VerifiedIdentity,
  type StoredIdentity,
  type AuthenticatedCaller,
} from './types';
export interface AuthenticationInput {
  readonly authorization: string | null | undefined;
  readonly sourceAddress: string;
  readonly signal?: AbortSignal;
}
export function createAuthenticator(dependencies: {
  readonly mode: 'disabled' | 'clerk' | 'test';
  readonly verifier: TokenVerifier;
  readonly admission: ReturnType<typeof createAdmission>;
  readonly resolveUser: (
    identity: VerifiedIdentity,
    signal?: AbortSignal,
  ) => Promise<StoredIdentity>;
}) {
  return async (input: AuthenticationInput): Promise<AuthenticatedCaller> => {
    if (input.signal?.aborted) throw unavailable();
    if (dependencies.mode === 'disabled') throw unauthorized();
    dependencies.admission.beforeVerification(input.sourceAddress);
    const match = /^Bearer ([^\s,]+)$/i.exec(input.authorization ?? '');
    if (!match || Buffer.byteLength(match[1]!) > 8192) throw unauthorized();
    const identity = await dependencies.verifier.verify(match[1]!);
    if (input.signal?.aborted) throw unavailable();
    dependencies.admission.beforeMapping(identity);
    let user: StoredIdentity;
    try {
      user = await dependencies.resolveUser(identity, input.signal);
    } catch {
      throw unavailable();
    }
    if (input.signal?.aborted) throw unavailable();
    if (user.status === 'disabled') throw new IdentityFailure(403, 'forbidden');
    if (user.status !== 'active' || !user.id) throw unavailable();
    return Object.freeze({ userId: user.id });
  };
}
