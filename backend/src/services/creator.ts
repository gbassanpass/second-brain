import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { creators } from '../db/schema.js';
import { personaCardSchema } from '../rag/persona.js';

/**
 * Landing-safe public profile of a creator (E6.1).
 *
 * Deliberately a curated subset of the row + Persona Card — the full persona
 * (frameworks, do/dont, catchphrases) feeds the prompt and is not exposed to
 * anonymous visitors. `oneLiner`/`disclaimer` come from the Persona Card when
 * it's set; both are null until a creator is seeded.
 */
export interface PublicCreator {
  slug: string;
  displayName: string;
  niche: string | null;
  oneLiner: string | null;
  disclaimer: string | null;
}

export async function getPublicCreator(db: Database, slug: string): Promise<PublicCreator | null> {
  const [row] = await db
    .select({
      slug: creators.slug,
      displayName: creators.displayName,
      niche: creators.niche,
      personaCard: creators.personaCard,
    })
    .from(creators)
    .where(eq(creators.slug, slug))
    .limit(1);

  if (!row) return null;

  const card = personaCardSchema.safeParse(row.personaCard);
  return {
    slug: row.slug,
    displayName: row.displayName,
    niche: row.niche ?? null,
    oneLiner: card.success ? card.data.one_liner : null,
    disclaimer: card.success ? (card.data.disclaimer ?? null) : null,
  };
}
