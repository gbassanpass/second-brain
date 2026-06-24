/**
 * Access codes (F1.17). Owner-side management lives under `/api/creators/:slug`;
 * the audience-side redeem is `/api/c/:slug/redeem`.
 */

export interface AccessCode {
  id: string;
  code: string;
  label: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export async function fetchAccessCodes(slug: string, token: string | null): Promise<AccessCode[]> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/access-codes`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`access codes load failed: ${res.status}`);
  return ((await res.json()) as { codes: AccessCode[] }).codes;
}

export async function createAccessCode(
  slug: string,
  input: { label?: string; maxRedemptions?: number },
  token: string | null,
): Promise<AccessCode> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/access-codes`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`access code create failed: ${res.status}`);
  return ((await res.json()) as { code: AccessCode }).code;
}

export async function setAccessCodeActive(
  slug: string,
  id: string,
  active: boolean,
  token: string | null,
): Promise<AccessCode> {
  const res = await fetch(
    `/api/creators/${encodeURIComponent(slug)}/access-codes/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ active }) },
  );
  if (!res.ok) throw new Error(`access code update failed: ${res.status}`);
  return ((await res.json()) as { code: AccessCode }).code;
}

export type RedeemOutcome = { ok: true; alreadyGranted: boolean } | { ok: false; reason: string };

/** Human message for each redeem failure reason. */
export const REDEEM_MESSAGES: Record<string, string> = {
  not_found: 'Código inválido. Confira e tente de novo.',
  inactive: 'Esse código foi desativado.',
  expired: 'Esse código expirou.',
  exhausted: 'Esse código atingiu o limite de usos.',
};

export async function redeemAccessCode(
  slug: string,
  code: string,
  token: string | null,
): Promise<RedeemOutcome> {
  const res = await fetch(`/api/c/${encodeURIComponent(slug)}/redeem`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  });
  if (res.ok) {
    const body = (await res.json()) as { alreadyGranted: boolean };
    return { ok: true, alreadyGranted: body.alreadyGranted };
  }
  if (res.status === 422) {
    const body = (await res.json()) as { reason: string };
    return { ok: false, reason: body.reason };
  }
  return { ok: false, reason: 'error' };
}

/** Shareable link that pre-fills the code on the creator's chat page. */
export function accessCodeLink(slug: string, code: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/c/${encodeURIComponent(slug)}/chat?code=${encodeURIComponent(code)}`;
}
