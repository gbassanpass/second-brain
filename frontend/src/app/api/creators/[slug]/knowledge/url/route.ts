import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../../lib/api';

/** Proxy for `POST /api/creators/:slug/knowledge/url` (ingest a web page, F1.9). */
export function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/knowledge/url`);
}
