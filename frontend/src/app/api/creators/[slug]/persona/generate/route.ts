import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../lib/api';

/** Proxy for `POST /api/creators/:slug/persona/generate` (auto-persona, F1.x). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/persona/generate`);
}
