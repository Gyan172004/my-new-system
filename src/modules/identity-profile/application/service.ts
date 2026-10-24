import { createActiveUserLookup } from './active-user';
import { getRuntime, type RuntimeRegistry } from '../../../server/runtime';
import { runtimeDatabase } from '../../../server/database';
import { createClerkVerifier } from '../adapters/clerk-verifier';
import { createTestVerifier } from '../adapters/test-verifier';
import { createUserRepository } from '../persistence/users';
import { createAdmission } from './admission';
import { createAuthenticator } from './authenticate';
import { unauthorized, unavailable, type TokenVerifier } from './types';
const serviceKey = Symbol.for('dsa-interview.identity.service.v1');
export function runtimeIdentity(runtime: RuntimeRegistry = getRuntime()) {
  return runtime.getOrCreate(serviceKey, () => {
    const config = runtime.config;
    let verifier: TokenVerifier;
    if (config.identityAdapter === 'clerk') {
      if (!config.clerk) throw unavailable();
      verifier = createClerkVerifier(config.clerk);
    } else if (config.identityAdapter === 'test')
      verifier = createTestVerifier(config.appEnv);
    else
      verifier = {
        async verify() {
          throw unauthorized();
        },
      };
    const admission = createAdmission();
    const users = createUserRepository(runtimeDatabase(runtime));
    return {
      authenticate: createAuthenticator({
        mode: config.identityAdapter,
        verifier,
        admission,
        resolveUser: users.resolve,
      }),
      lookupActiveUser: createActiveUserLookup(runtimeDatabase(runtime)),
      close: admission.close,
      destroy: admission.destroy,
    };
  });
}
