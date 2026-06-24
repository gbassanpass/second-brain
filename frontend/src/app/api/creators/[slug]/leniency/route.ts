import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

/** Proxy for `GET|PUT /api/creators/:slug/leniency` (extrapolation level, F1.5.4). */
export function GET(req: NextRequest, { params }: { params: { slug: string } }): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/leniency`);
}

export function PUT(req: NextRequest, { params }: { params: { slug: string } }): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/leniency`);
}
