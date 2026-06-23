import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { creators } from '../db/schema.js';
import { type PersonaCard, personaCardSchema } from '../rag/persona.js';

export async function getPersonaCard(
  db: Database,
  creatorSlug: string,
): Promise<PersonaCard | null> {
  const [row] = await db
    .select({ personaCard: creators.personaCard })
    .from(creators)
    .where(eq(creators.slug, creatorSlug))
    .limit(1);
  if (!row) return null;
  if (row.personaCard === null || row.personaCard === undefined) return null;

  // The column is `jsonb` so the driver gives us a structured value already.
  // Run it through the schema to surface a clear error if a malformed card
  // was persisted by an older version of the API or a manual DB edit.
  return personaCardSchema.parse(row.personaCard);
}

export interface SetPersonaCardResult {
  card: PersonaCard;
}

export async function setPersonaCard(
  db: Database,
  creatorSlug: string,
  card: PersonaCard,
): Promise<SetPersonaCardResult | { error: 'creator_not_found' }> {
  // Parse for normalization (applies `.default([])` etc.) and to fail fast.
  const validated = personaCardSchema.parse(card);
  const rows = await db
    .update(creators)
    .set({ personaCard: validated })
    .where(eq(creators.slug, creatorSlug))
    .returning({ id: creators.id });
  if (!rows[0]) return { error: 'creator_not_found' };
  return { card: validated };
}
