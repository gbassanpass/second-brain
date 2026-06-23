import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../../lib/api';

/** Proxy for `POST /api/billing/checkout` (E6.3) — opens a hosted checkout. */
export function POST(req: NextRequest): Promise<Response> {
  return forwardToBackend(req, '/api/billing/checkout');
}
