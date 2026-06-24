/**
 * Voice (F1.3). Asks the backend to speak a clone reply and returns the audio
 * as an object URL the caller can feed to an <audio> element. Caller must
 * `URL.revokeObjectURL` when done.
 */
export async function synthesizeSpeech(
  slug: string,
  text: string,
  token: string | null,
): Promise<string> {
  const res = await fetch('/api/voice', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ creatorSlug: slug, text }),
  });
  if (!res.ok) throw new Error(`voice synthesis failed: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
