import type { NextRequest } from 'next/server';
import { apiBaseUrl } from '../../../../../../lib/api';

/**
 * Proxy for `POST /api/creators/:slug/knowledge/file` (F1.9). Multipart upload —
 * re-posts the parsed FormData so a fresh boundary is generated (can't just
 * forward the raw text body like the JSON proxies do).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
): Promise<Response> {
  const form = await req.formData();
  const headers: Record<string, string> = {};
  const auth = req.headers.get('authorization');
  if (auth) headers.authorization = auth;

  const upstream = await fetch(
    `${apiBaseUrl()}/api/creators/${encodeURIComponent(params.slug)}/knowledge/file`,
    { method: 'POST', headers, body: form },
  );
  const payload = await upstream.text();
  return new Response(payload, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
