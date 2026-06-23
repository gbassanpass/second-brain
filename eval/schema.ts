import { z } from 'zod';

/**
 * Golden-question schema for the RAG eval harness (E4).
 *
 * Each entry pins:
 *   - the user query we'll fire at `POST /api/chat`,
 *   - what the orchestrator should DO with it (guardrail flag, fallback path,
 *     post-filter category),
 *   - what the answer must (or must not) contain.
 *
 * The harness (E4.2) runs every entry against the real pipeline and asserts
 * the `expects` block. The shape is intentionally narrow — broader scoring
 * (an LLM-judge for "soa como o criador") layers on top.
 */
export const goldenCategorySchema = z.enum([
  'geopolitics',
  'faith',
  'life_decision',
  'investment',
  'safety',
]);
export type GoldenCategory = z.infer<typeof goldenCategorySchema>;

export const guardrailFlagExpect = z.enum(['investment']).nullable();
export const fallbackExpect = z.enum(['no_context']).nullable();
export const postFilterCategoryExpect = z.enum(['recommendation', 'missing_citation']).nullable();

/**
 * Each assertion field follows a 3-state convention so YAML can be terse:
 *   - omitted (undefined) → harness does NOT check this dimension,
 *   - explicit `null`     → orchestrator must return null/no-fallback,
 *   - explicit value      → orchestrator must return exactly this value.
 *
 * Defaults are deliberately NOT applied — a missing `fallback:` should mean
 * "skip" rather than "must be null", so we can pin only the assertions that
 * matter per question.
 */
export const goldenExpectsSchema = z
  .object({
    /** What `messages.guardrail_flag` should be after the turn. */
    guardrail_flag: guardrailFlagExpect.optional(),
    /** Whether the orchestrator must short-circuit to "não tenho isso registrado". */
    fallback: fallbackExpect.optional(),
    /** Which post-filter pass we expect to trigger (if any). */
    post_filter_category: postFilterCategoryExpect.optional(),
    /** Substrings that must appear in the assistant content (any of them). */
    must_contain_any: z.array(z.string().min(1)).default([]),
    /** Substrings that must NOT appear (case-insensitive match). */
    must_not_contain: z.array(z.string().min(1)).default([]),
    /**
     * If `true`, the response must include at least one `[N]` marker.
     * Omit on no_context / refusal questions where citations aren't expected.
     */
    requires_citation: z.boolean().optional(),
  })
  .strict();
export type GoldenExpects = z.infer<typeof goldenExpectsSchema>;

export const goldenQuestionSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
    category: goldenCategorySchema,
    query: z.string().min(1).max(2000),
    /** Free-text rationale — why this question is in the set. Optional. */
    note: z.string().optional(),
    expects: goldenExpectsSchema,
  })
  .strict();
export type GoldenQuestion = z.infer<typeof goldenQuestionSchema>;

export const goldenSetSchema = z
  .object({
    version: z.literal(1),
    creator: z.string().min(1),
    questions: z.array(goldenQuestionSchema).min(1),
  })
  .strict()
  .superRefine((set, ctx) => {
    const seen = new Set<string>();
    for (const [idx, q] of set.questions.entries()) {
      if (seen.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', idx, 'id'],
          message: `duplicate id: ${q.id}`,
        });
      }
      seen.add(q.id);
    }
  });
export type GoldenSet = z.infer<typeof goldenSetSchema>;
