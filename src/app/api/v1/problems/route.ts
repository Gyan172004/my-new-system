import { catalogueGet } from '../../../../server/catalogue-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request): Promise<Response> {
  return catalogueGet(request);
}
