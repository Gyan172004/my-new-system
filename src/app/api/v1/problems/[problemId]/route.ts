import { catalogueGet } from '../../../../../server/catalogue-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  context: { params: Promise<{ problemId: string }> },
): Promise<Response> {
  const { problemId } = await context.params;
  return catalogueGet(request, problemId);
}
