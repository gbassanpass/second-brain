import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../../lib/api';

/** Proxy for `POST /api/creators/:slug/sources/:id/resync` (re-pull a source). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
): Promise<Response> {
  return forwardToBackend(
    req,
    `/api/creators/${encodeURIComponent(params.slug)}/sources/${encodeURIComponent(params.id)}/resync`,
  );
}
