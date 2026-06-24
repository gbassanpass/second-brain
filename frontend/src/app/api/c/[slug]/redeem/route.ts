import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

/** Proxy for `POST /api/c/:slug/redeem` (redeem an access code, F1.17). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(req, `/api/c/${encodeURIComponent(params.slug)}/redeem`);
}
