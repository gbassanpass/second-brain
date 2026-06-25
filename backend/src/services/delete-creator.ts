import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  accessCodes,
  accessGrants,
  chunks,
  consents,
  contentIdeas,
  contentSources,
  conversations,
  creators,
  documents,
  kgEntities,
  kgRelations,
  messages,
  subscriptions,
} from '../db/schema.js';

/**
 * Permanently delete a creator (clone) and everything that belongs to it.
 *
 * Most FKs to `creators` are NOT `onDelete: cascade`, so a bare
 * `DELETE FROM creators` fails. We delete every dependent in FK-safe order
 * inside a transaction (all-or-nothing). Order matters: a table must be cleared
 * before the table it references — e.g. `kg_relations` (→ kg_entities, chunks)
 * before both, `chunks` (→ documents) before `documents`, etc.
 *
 * Used by the owner-only "Apagar clone" action so a creator can wipe their own
 * test data. Does NOT touch `users` / `auth.users` (the account survives).
 */
export async function deleteCreatorCascade(db: Database, creatorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(kgRelations).where(eq(kgRelations.creatorId, creatorId));
    await tx.delete(kgEntities).where(eq(kgEntities.creatorId, creatorId));
    await tx.delete(chunks).where(eq(chunks.creatorId, creatorId));
    await tx.delete(documents).where(eq(documents.creatorId, creatorId));
    await tx.delete(contentSources).where(eq(contentSources.creatorId, creatorId));
    await tx.delete(messages).where(eq(messages.creatorId, creatorId));
    await tx.delete(conversations).where(eq(conversations.creatorId, creatorId));
    await tx.delete(accessGrants).where(eq(accessGrants.creatorId, creatorId));
    await tx.delete(accessCodes).where(eq(accessCodes.creatorId, creatorId));
    await tx.delete(subscriptions).where(eq(subscriptions.creatorId, creatorId));
    await tx.delete(consents).where(eq(consents.creatorId, creatorId));
    await tx.delete(contentIdeas).where(eq(contentIdeas.creatorId, creatorId));
    await tx.delete(creators).where(eq(creators.id, creatorId));
  });
}
