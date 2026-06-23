import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../lib/api';

/** Proxy for `GET /api/me` (E6.4) — current user + domain role for Studio gating. */
export function GET(req: NextRequest): Promise<Response> {
  return forwardToBackend(req, '/api/me');
}
