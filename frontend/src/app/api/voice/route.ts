import type { NextRequest } from 'next/server';
import { apiBaseUrl } from '../../../lib/api';

/**
 * Proxy for `POST /api/voice` (F1.3). Unlike the JSON proxies we stream the
 * backend's audio bytes straight through, preserving content-type so the
 * browser can play the MP3.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const auth = req.headers.get('authorization');
  if (auth) headers.authorization = auth;

  const upstream = await fetch(`${apiBaseUrl()}/api/voice`, {
    method: 'POST',
    headers,
    body: await req.text(),
  });

  // Errors come back as JSON; success comes back as audio. Pass both through
  // with the upstream content-type.
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'no-store',
    },
  });
}
