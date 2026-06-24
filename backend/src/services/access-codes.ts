import { randomInt } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { accessCodes, accessGrants } from '../db/schema.js';

/** Unambiguous alphabet (no 0/O/1/I) so codes are easy to read/share/type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Generate a random shareable code like `K7QXM4PR` (uppercase, unambiguous). */
export function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export interface AccessCodeRow {
  id: string;
  code: string;
  label: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateAccessCodeInput {
  creatorId: string;
  label?: string;
  maxRedemptions?: number;
  expiresAt?: Date;
}

/**
 * Create an access code for a creator (F1.17). Retries a few times on the rare
 * code collision (globally-unique index) before giving up.
 */
export async function createAccessCode(
  db: Database,
  input: CreateAccessCodeInput,
): Promise<AccessCodeRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(accessCodes)
        .values({
          creatorId: input.creatorId,
          code: generateCode(),
          label: input.label ?? null,
          maxRedemptions: input.maxRedemptions ?? null,
          expiresAt: input.expiresAt ?? null,
        })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return toRow(row);
    } catch (err) {
      // 23505 = unique_violation on the code index → try a fresh code.
      if ((err as { code?: string }).code === '23505' && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error('could not generate a unique access code');
}

export async function listAccessCodes(db: Database, creatorId: string): Promise<AccessCodeRow[]> {
  const rows = await db
    .select()
    .from(accessCodes)
    .where(eq(accessCodes.creatorId, creatorId))
    .orderBy(desc(accessCodes.createdAt));
  return rows.map(toRow);
}

/**
 * Activate/deactivate a code, scoped to the creator so one creator can't touch
 * another's codes. Returns the updated row, or null if it isn't theirs.
 */
export async function setAccessCodeActive(
  db: Database,
  creatorId: string,
  codeId: string,
  active: boolean,
): Promise<AccessCodeRow | null> {
  const [row] = await db
    .update(accessCodes)
    .set({ active })
    .where(and(eq(accessCodes.id, codeId), eq(accessCodes.creatorId, creatorId)))
    .returning();
  return row ? toRow(row) : null;
}

export type RedeemResult =
  | { ok: true; alreadyGranted: boolean }
  | { ok: false; reason: 'not_found' | 'inactive' | 'expired' | 'exhausted' };

export interface RedeemInput {
  userId: string;
  creatorId: string;
  code: string;
  now?: () => number;
}

/**
 * Redeem a code for a creator (F1.17). Validates the code and, on success,
 * creates the `access_grants` row the paywall honors. Runs in a transaction
 * with a row lock so concurrent redemptions can't exceed `maxRedemptions`.
 * Idempotent: a user who already has a grant for this creator succeeds without
 * consuming another redemption.
 */
export async function redeemAccessCode(db: Database, input: RedeemInput): Promise<RedeemResult> {
  const nowMs = (input.now ?? Date.now)();
  const normalized = input.code.trim().toUpperCase();
  if (!normalized) return { ok: false, reason: 'not_found' };

  return db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(accessCodes)
      .where(and(eq(accessCodes.code, normalized), eq(accessCodes.creatorId, input.creatorId)))
      .limit(1)
      .for('update');

    if (!code) return { ok: false, reason: 'not_found' };

    // If the user already redeemed (any code) for this creator, it's a no-op
    // success — don't burn another redemption.
    const [existing] = await tx
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(
        and(eq(accessGrants.userId, input.userId), eq(accessGrants.creatorId, input.creatorId)),
      )
      .limit(1);
    if (existing) return { ok: true, alreadyGranted: true };

    if (!code.active) return { ok: false, reason: 'inactive' };
    if (code.expiresAt && code.expiresAt.getTime() <= nowMs) {
      return { ok: false, reason: 'expired' };
    }
    if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) {
      return { ok: false, reason: 'exhausted' };
    }

    await tx.insert(accessGrants).values({
      creatorId: input.creatorId,
      userId: input.userId,
      codeId: code.id,
    });
    await tx
      .update(accessCodes)
      .set({ redemptionCount: code.redemptionCount + 1 })
      .where(eq(accessCodes.id, code.id));

    return { ok: true, alreadyGranted: false };
  });
}

function toRow(row: typeof accessCodes.$inferSelect): AccessCodeRow {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    active: row.active,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
