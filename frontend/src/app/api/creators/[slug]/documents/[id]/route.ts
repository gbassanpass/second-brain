import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../lib/api';

/** Proxy for `GET /api/creators/:slug/documents/:id` (document detail, F1.9). */
export function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } },
): Promise<Response> {
  return forwardToBackend(
    req,
    `/api/creators/${encodeURIComponent(params.slug)}/documents/${encodeURIComponent(params.id)}`,
  );
}
