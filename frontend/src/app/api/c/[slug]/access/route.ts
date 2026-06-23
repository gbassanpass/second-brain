import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

/** Proxy for the paywall pre-flight `GET /api/c/:slug/access` (E6.3). */
export function GET(req: NextRequest, { params }: { params: { slug: string } }): Promise<Response> {
  return forwardToBackend(req, `/api/c/${encodeURIComponent(params.slug)}/access`);
}
