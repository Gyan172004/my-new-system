// Server-only identity boundary. Browser integration has a separate public entry.
export { IdentityFailure } from './application/types';
export type { AuthenticatedCaller } from './application/types';
export { safeReturnPath } from './application/redirect';
export { runtimeIdentity } from './application/service';

export { createActiveUserLookup } from './application/active-user';
export type { AuthenticationInput } from './application/authenticate';
