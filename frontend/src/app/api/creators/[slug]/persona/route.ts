import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../../lib/api';

type Ctx = { params: { slug: string } };

/** Proxy for the Studio persona editor (`GET|PUT /api/creators/:slug/persona`, E6.4). */
export function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/persona`);
}

export function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  return forwardToBackend(req, `/api/creators/${encodeURIComponent(params.slug)}/persona`);
}
