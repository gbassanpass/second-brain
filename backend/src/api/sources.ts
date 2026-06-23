import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { contentSources } from '../db/schema.js';

export type EnqueueSyncFn = (sourceId: string) => Promise<{ jobId: string }>;

const idSchema = z.string().uuid();

export function createSourcesRouter(getDb: () => Database, enqueueSync: EnqueueSyncFn): Hono {
  const router = new Hono();

  router.post('/:id/sync', async (c) => {
    const id = c.req.param('id');
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return c.json({ error: 'invalid_source_id' }, 400);
    }

    const db = getDb();
    const [source] = await db
      .select({ id: contentSources.id })
      .from(contentSources)
      .where(eq(contentSources.id, id))
      .limit(1);
    if (!source) {
      return c.json({ error: 'source_not_found', id }, 404);
    }

    await db.update(contentSources).set({ status: 'pending' }).where(eq(contentSources.id, id));

    const { jobId } = await enqueueSync(id);
    return c.json({ sourceId: id, jobId, status: 'pending' }, 202);
  });

  return router;
}
