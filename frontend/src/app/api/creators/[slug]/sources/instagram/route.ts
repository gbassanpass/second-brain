import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../lib/api';

/** Proxy for `POST /api/creators/:slug/sources/instagram` (import by handle, F1.11). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(
    req,
    `/api/creators/${encodeURIComponent(params.slug)}/sources/instagram`,
  );
}
