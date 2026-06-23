import type { NextRequest } from 'next/server';
import { forwardToBackend } from '../../../lib/api';

/**
 * Same-origin proxy for `POST /api/chat` (E6.2/E6.3). Forwards the body and the
 * caller's bearer token to the Hono backend (avoids CORS, keeps the backend URL
 * server-side). The backend enforces auth + paywall + runs the RAG pipeline.
 */
export function POST(req: NextRequest): Promise<Response> {
  return forwardToBackend(req, '/api/chat');
}
