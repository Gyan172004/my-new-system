import type { AuthenticationInput } from '../../identity-profile/public';
import type { ContentStaffConfiguration } from '../../../server/content-staff';
import {
  createOperatorVerifier,
  fail,
  type PublishingIdentity,
} from './operators';
// Authentication and active-account lookup are real owning identity services at composition.
export function createReviewerAuthorization(
  identity: PublishingIdentity,
  staff: ContentStaffConfiguration,
) {
  const verify = createOperatorVerifier(identity, staff);
  return async (auth: AuthenticationInput) => {
    const actor = await verify(auth, 'review_content');
    if (
      !(await identity.lookupActiveUser(actor.userId, undefined, auth.signal))
    )
      fail('content_forbidden');
    return Object.freeze({ userId: actor.userId });
  };
}
