import { type NextRequest, NextResponse } from 'next/server';
import { apiBaseUrl } from '../../../lib/api';

/**
 * Same-origin proxy for `POST /api/chat` (E6.2).
 *
 * The browser posts here instead of hitting the Hono backend directly, which
 * (a) avoids CORS config on the backend and (b) keeps a seam to attach the
 * Supabase JWT server-side once login lands (the E5.2 follow-up — chat is
 * intentionally unauthenticated for now). The body is forwarded verbatim; the
 * backend remains the single source of validation (Zod) and the RAG pipeline.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const upstream = await fetch(`${apiBaseUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const payload = await upstream.text();
  return new NextResponse(payload, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
