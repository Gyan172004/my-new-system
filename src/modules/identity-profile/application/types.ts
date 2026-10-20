export interface VerifiedIdentity {
  readonly provider: string;
  readonly issuer: string;
  readonly subject: string;
}
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}
export interface AuthenticatedCaller {
  readonly userId: string;
}
export interface StoredIdentity {
  readonly id: string;
  readonly status: 'active' | 'disabled';
}
export class IdentityFailure extends Error {
  readonly retryable: boolean;
  constructor(
    readonly status: 401 | 403 | 429 | 503,
    readonly code:
      'unauthorized' | 'forbidden' | 'rate_limited' | 'identity_unavailable',
    readonly retryAfterSeconds: number | undefined = undefined,
  ) {
    super(code);
    this.name = 'IdentityFailure';
    this.retryable = status === 429 || status === 503;
  }
}
export const unauthorized = () => new IdentityFailure(401, 'unauthorized');
export const unavailable = () =>
  new IdentityFailure(503, 'identity_unavailable');
