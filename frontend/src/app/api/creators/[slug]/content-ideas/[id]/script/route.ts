import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../../lib/api';

/** Proxy for `POST /api/creators/:slug/content-ideas/:id/script` (roteiro). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
): Promise<Response> {
  return forwardToBackend(
    req,
    `/api/creators/${encodeURIComponent(params.slug)}/content-ideas/${encodeURIComponent(params.id)}/script`,
  );
}
