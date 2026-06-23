import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../lib/api';

/** Proxy for `POST /api/creators` (self-signup — create a clone, F1.x). */
export function POST(req: NextRequest): Promise<Response> {
  return forwardToBackend(req, '/api/creators');
}
