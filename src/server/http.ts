import { getRuntime } from './runtime';
import { runtimeRequestScope } from './request-context';
import { runtimeLogger } from './logger';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { createRequestScope } from './request-context';
import type { createSafeLogger } from './logger';
export function routeTemplate(url: string | undefined): string {
  const path = (url ?? '').split('?', 1)[0];
  return path === '/api/v1/health/live' || path === '/api/v1/health/ready'
    ? path
    : 'unmatched';
}
export function createHttpHandler(
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  options: {
    scope: ReturnType<typeof createRequestScope>;
    logger: ReturnType<typeof createSafeLogger>;
    isDraining(): boolean;
  },
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const abort = new AbortController();
    void options.scope
      .run(async () => {
        const context = options.scope.current()!;
        const route = routeTemplate(req.url);
        let completed = false;
        let finish!: () => void;
        const closed = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const complete = () => {
          if (completed) return;
          completed = true;
          const cancelled = !res.writableFinished;
          if (cancelled) abort.abort();
          options.logger.write('http_completed', {
            requestId: context.requestId,
            method: req.method,
            route,
            status: cancelled ? 499 : res.statusCode,
            elapsedMs: performance.now() - context.startedAt,
            ...(cancelled ? { code: 'request_cancelled' } : {}),
          });
          finish();
        };
        res.once('finish', complete);
        res.once('close', complete);
        const cancelled = () => abort.abort();
        req.once('aborted', cancelled);
        const fail = (draining: boolean) => {
          if (res.destroyed) return;
          if (res.headersSent) {
            res.destroy();
            return;
          }
          const status = draining || route !== 'unmatched' ? 503 : 500;
          res.writeHead(status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(
            JSON.stringify(
              route !== 'unmatched'
                ? {
                    status: 'unavailable',
                    timestamp: new Date().toISOString(),
                    checks: { application: 'unavailable' },
                  }
                : {
                    code: draining ? 'service_unavailable' : 'internal_error',
                    message: draining
                      ? 'Service unavailable'
                      : 'Request failed',
                    requestId: context.requestId,
                  },
            ),
          );
        };
        try {
          if (options.isDraining()) fail(true);
          else
            await Promise.race([
              Promise.resolve()
                .then(() => handle(req, res))
                .catch(() => {
                  if (!completed) {
                    options.logger.write('http_failed', {
                      requestId: context.requestId,
                      method: req.method,
                      route,
                      code: 'internal_error',
                    });
                    fail(false);
                  }
                }),
              closed,
            ]);
          await closed;
        } finally {
          req.off('aborted', cancelled);
          res.off('finish', complete);
          res.off('close', complete);
        }
      }, abort.signal)
      .catch(() => {
        if (!res.destroyed) res.destroy();
      });
  };
}

// Catch health failures before Next can serialize raw dependency diagnostics.
export function healthFailure(): Response {
  try {
    const registry = getRuntime();
    const context = runtimeRequestScope(registry).current();
    runtimeLogger(registry).write('http_failed', {
      requestId: context?.requestId,
      code: 'internal_error',
    });
  } catch {
    /* A stopped/unavailable registry cannot prevent a safe health response. */
  }
  return Response.json(
    {
      status: 'unavailable',
      timestamp: new Date().toISOString(),
      checks: { application: 'unavailable' },
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
