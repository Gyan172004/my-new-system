import { randomUUID } from 'node:crypto';
import {
  IdentityFailure,
  runtimeIdentity,
  type AuthenticatedCaller,
} from '../modules/identity-profile/public';
import { getRuntime, type RuntimeRegistry } from './runtime';
import { runtimeRequestScope } from './request-context';
import { runtimeLogger } from './logger';
const cache = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
export async function withCandidate(
  request: Request,
  work: (caller: AuthenticatedCaller, signal: AbortSignal) => Promise<Response>,
  runtime?: RuntimeRegistry,
): Promise<Response> {
  let requestId: string = randomUUID();
  let registry: RuntimeRegistry | undefined;
  try {
    registry = runtime ?? getRuntime();
    const context = runtimeRequestScope(registry).current();
    if (context) requestId = context.requestId;
    if (!context?.sourceAddress || registry.state !== 'SERVING')
      throw new IdentityFailure(503, 'identity_unavailable');
    const signal = context.signal
      ? AbortSignal.any([context.signal, request.signal])
      : request.signal;
    const caller = await runtimeIdentity(registry).authenticate({
      authorization: request.headers.get('authorization'),
      sourceAddress: context.sourceAddress,
      signal,
    });
    signal.throwIfAborted();
    const result = await work(caller, signal);
    signal.throwIfAborted();
    result.headers.set('Cache-Control', cache['Cache-Control']);
    const vary = result.headers.get('Vary');
    result.headers.set(
      'Vary',
      vary ? `${vary}, Authorization` : 'Authorization',
    );
    return result;
  } catch (error) {
    const failure =
      error instanceof IdentityFailure
        ? error
        : new IdentityFailure(503, 'identity_unavailable');
    try {
      if (registry)
        runtimeLogger(registry).write('identity_denied', {
          requestId,
          status: failure.status,
          code: failure.code,
        });
    } catch {
      /* Draining registries cannot prevent a safe response. */
    }
    const messages = {
      unauthorized: 'Sign in to continue',
      forbidden: 'Access is unavailable',
      rate_limited: 'Too many requests. Please try again later.',
      identity_unavailable: 'Sign-in verification is temporarily unavailable',
    };
    return Response.json(
      {
        code: failure.code,
        message: messages[failure.code],
        requestId,
        retryable: failure.retryable,
      },
      {
        status: failure.status,
        headers: {
          ...cache,
          ...(failure.retryAfterSeconds !== undefined
            ? { 'Retry-After': String(failure.retryAfterSeconds) }
            : {}),
        },
      },
    );
  }
}
