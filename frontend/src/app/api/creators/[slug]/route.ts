import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../lib/api';

/** Proxy for `DELETE /api/creators/:slug` — owner deletes their clone + all data. */
export function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}`);
}
