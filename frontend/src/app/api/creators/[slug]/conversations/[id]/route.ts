import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../lib/api';

/** Proxy for `GET /api/creators/:slug/conversations/:id` (Studio, F1.13). */
export function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
): Promise<Response> {
  return forwardToBackend(
    req,
    `/api/creators/${encodeURIComponent(params.slug)}/conversations/${encodeURIComponent(params.id)}`,
  );
}
