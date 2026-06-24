import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { creators } from '../db/schema.js';
import type { VoiceSynth } from '../voice/base.js';
import { type AccessVariables, requireAccess } from './middleware/require-access.js';
import { type RequireAuthDeps, requireAuth } from './middleware/require-auth.js';

const voiceBody = z.object({
  creatorSlug: z.string().min(1),
  text: z.string().min(1),
});

export interface VoiceRouterDeps extends RequireAuthDeps {
  getVoice: () => VoiceSynth;
  /** Fallback voice id when the creator has none, model, and char cap. */
  getConfig: () => { ELEVENLABS_VOICE_ID: string; VOICE_MODEL: string; VOICE_MAX_CHARS: number };
  /** Clock override forwarded to `requireAccess` — used by tests. */
  now?: () => number;
}

/**
 * Speak the clone's reply (F1.3). Same access gate as chat — a logged-in user
 * with access (active subscription, or creator/operator) — since hearing a
 * reply is part of the paid conversation. Returns `audio/mpeg` bytes.
 */
export function createVoiceRouter(deps: VoiceRouterDeps): Hono<{ Variables: AccessVariables }> {
  const router = new Hono<{ Variables: AccessVariables }>();

  router.use('/', requireAuth(deps));
  router.use(
    '/',
    requireAccess({
      getDb: deps.getDb,
      now: deps.now,
      resolveSlug: async (c) => {
        const json = (await c.req.json().catch(() => null)) as { creatorSlug?: unknown } | null;
        return typeof json?.creatorSlug === 'string' ? json.creatorSlug : undefined;
      },
    }),
  );

  router.post('/', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = voiceBody.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }

    const config = deps.getConfig();
    const text = parsed.data.text.trim();
    if (text.length > config.VOICE_MAX_CHARS) {
      return c.json({ error: 'text_too_long', maxChars: config.VOICE_MAX_CHARS }, 413);
    }

    const access = c.get('access');
    const [creator] = await deps
      .getDb()
      .select({ voiceId: creators.voiceId })
      .from(creators)
      .where(eq(creators.id, access.creatorId))
      .limit(1);

    const voiceId = creator?.voiceId ?? config.ELEVENLABS_VOICE_ID;
    if (!voiceId) return c.json({ error: 'voice_not_configured' }, 503);

    try {
      const spoken = await deps.getVoice().speak(text, { voiceId, modelId: config.VOICE_MODEL });
      c.header('content-type', spoken.contentType);
      c.header('content-length', String(spoken.audio.length));
      c.header('cache-control', 'no-store');
      return c.body(spoken.audio);
    } catch (err) {
      const message = (err as Error).message;
      return c.json({ error: 'voice_synthesis_failed', detail: message.slice(0, 200) }, 502);
    }
  });

  return router;
}
