import { randomUUID } from 'node:crypto';
import {
  CatalogueFailure,
  createCatalogueReader,
} from '../modules/problem-catalogue/public';
import { runtimeDatabase } from './database';
import { withCandidate } from './identity-http';
import { getRuntime, type RuntimeRegistry } from './runtime';
import { runtimeRequestScope } from './request-context';
import { runtimeLogger } from './logger';
/** Catalogue errors are mapped inside admission so they retain their own semantics. */
export async function catalogueResponse(
  work: () => Promise<unknown>,
  runtime?: RuntimeRegistry,
): Promise<Response> {
  let registry = runtime;
  let requestId: string = randomUUID();
  const started = performance.now();
  try {
    registry ??= getRuntime();
    requestId = runtimeRequestScope(registry).current()?.requestId ?? requestId;
  } catch {
    /* Standalone contract tests have no installed process registry. */
  }
  let code = 'ok';
  let status = 200;
  try {
    return Response.json(await work());
  } catch (error) {
    const known =
      error instanceof CatalogueFailure ? error.code : 'catalogue_unavailable';
    status = known === 'bad_request' ? 400 : known === 'not_found' ? 404 : 503;
    code = known === 'bad_request' ? 'invalid_request' : known;
    return Response.json(
      {
        code,
        message:
          status === 400
            ? 'Check the request parameters.'
            : status === 404
              ? 'Problem is unavailable.'
              : 'Problems are temporarily unavailable.',
        requestId,
        retryable: status === 503,
      },
      { status },
    );
  } finally {
    try {
      if (registry)
        runtimeLogger(registry).write('catalogue_read', {
          requestId,
          status,
          code,
          elapsedMs: performance.now() - started,
        });
    } catch {
      /* Teardown cannot prevent a safe response. */
    }
  }
}
export function catalogueGet(
  request: Request,
  problemId?: string,
  runtime?: RuntimeRegistry,
) {
  return withCandidate(
    request,
    async (_caller, signal) =>
      catalogueResponse(async () => {
        const registry = runtime ?? getRuntime();
        const reader = createCatalogueReader(runtimeDatabase(registry));
        const query = new URL(request.url).searchParams;
        const allowed = problemId === undefined ? ['limit', 'cursor'] : [];
        for (const key of query.keys())
          if (!allowed.includes(key) || query.getAll(key).length !== 1)
            throw new CatalogueFailure('bad_request');
        if (problemId !== undefined) return reader.detail(problemId, signal);
        return reader.list(
          {
            ...(query.has('limit') ? { limit: query.get('limit')! } : {}),
            ...(query.has('cursor') ? { cursor: query.get('cursor')! } : {}),
          },
          signal,
        );
      }, runtime),
    runtime,
  );
}
