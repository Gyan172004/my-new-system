import { liveness } from '../../../../../server/health';
import { getRuntime } from '../../../../../server/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET(): Response {
  getRuntime();
  return Response.json(liveness(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
