import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { creators } from '../db/schema.js';

/**
 * Leniency (F1.5.4) — how far the clone may extrapolate beyond explicit
 * content when retrieval finds nothing direct (doc 10 §pesos de confiança):
 *   - strict:   never extrapolate → "não tenho isso registrado".
 *   - balanced: extrapolate only with strong principles (≥2 facts). Default.
 *   - open:     extrapolate readily (≥1 fact).
 */
export type Leniency = 'strict' | 'balanced' | 'open';
export const LENIENCY_LEVELS: readonly Leniency[] = ['strict', 'balanced', 'open'] as const;

export function isLeniency(v: unknown): v is Leniency {
  return typeof v === 'string' && (LENIENCY_LEVELS as readonly string[]).includes(v);
}

export function coerceLeniency(v: unknown): Leniency {
  return isLeniency(v) ? v : 'balanced';
}

/**
 * Minimum KG facts required to extrapolate at this level. `null` means the
 * level never extrapolates (strict → refuse).
 */
export function minFactsToExtrapolate(level: Leniency): number | null {
  if (level === 'strict') return null;
  if (level === 'open') return 1;
  return 2;
}

export async function getLeniency(db: Database, creatorId: string): Promise<Leniency> {
  const [row] = await db
    .select({ leniency: creators.leniency })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  return coerceLeniency(row?.leniency);
}

/** Set a creator's leniency (caller already enforced ownership). */
export async function setLeniency(db: Database, creatorId: string, level: Leniency): Promise<void> {
  await db.update(creators).set({ leniency: level }).where(eq(creators.id, creatorId));
}
