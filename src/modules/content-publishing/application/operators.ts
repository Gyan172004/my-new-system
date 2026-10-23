import type {
  AuthenticatedCaller,
  AuthenticationInput,
} from '../../identity-profile/public';
import type { TransactionScope } from '../../../server/transaction';
import type {
  ContentPermission,
  ContentStaffConfiguration,
} from '../../../server/content-staff';
export interface PublishingIdentity {
  authenticate(input: AuthenticationInput): Promise<AuthenticatedCaller>;
  lookupActiveUser(
    userId: string,
    scope?: TransactionScope,
    signal?: AbortSignal,
  ): Promise<Readonly<{ userId: string }> | null>;
}
export class PublishingFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PublishingFailure';
  }
}
export const fail = (code: string): never => {
  throw new PublishingFailure(code);
};
export function permits(
  staff: ContentStaffConfiguration,
  userId: string,
  permission: ContentPermission,
) {
  return staff.grants.some(
    (g) =>
      g.userId === userId.toLowerCase() && g.permissions.includes(permission),
  );
}
export function createOperatorVerifier(
  identity: PublishingIdentity,
  staff: ContentStaffConfiguration,
) {
  return async (input: AuthenticationInput, permission: ContentPermission) => {
    const caller = await identity.authenticate(input);
    if (!permits(staff, caller.userId, permission)) fail('content_forbidden');
    return Object.freeze({ userId: caller.userId, snapshot: staff });
  };
}
