import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../lib/api';

/** Proxy for `PATCH /api/creators/:slug/access-codes/:id` (activate/deactivate, F1.17). */
export function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
): Promise<Response> {
  return forwardToBackend(
    req,
    `/api/creators/${encodeURIComponent(params.slug)}/access-codes/${encodeURIComponent(params.id)}`,
  );
}
