import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

/** Proxy for owner access-code management `GET|POST /api/creators/:slug/access-codes` (F1.17). */
export function GET(req: NextRequest, { params }: { params: { slug: string } }): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/access-codes`);
}

export function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/access-codes`);
}
