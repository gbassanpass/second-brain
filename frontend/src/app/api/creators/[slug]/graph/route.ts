import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

/** Proxy for `GET /api/creators/:slug/graph` (Mind graph, F1.18). */
export function GET(req: NextRequest, { params }: { params: { slug: string } }): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/graph`);
}
