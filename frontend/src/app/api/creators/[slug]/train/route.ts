import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

/** Proxy for `POST /api/creators/:slug/train` (training correction, F1.12). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/train`);
}
