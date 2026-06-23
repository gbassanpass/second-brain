import { z } from 'zod';

/**
 * Persona Card schema — `creators.persona_card` JSONB shape, per docs/05.
 *
 * The card feeds the cached system prompt. Field names are snake_case
 * deliberately: they're rendered as-is in the prompt and need to match what
 * the LLM sees (and what a non-engineer editing the JSON in Studio will type).
 */
export const personaCardSchema = z
  .object({
    name: z.string().min(1),
    one_liner: z.string().min(1),
    voice: z.array(z.string().min(1)).min(1),
    frameworks: z.array(z.string().min(1)).default([]),
    do: z.array(z.string().min(1)).default([]),
    dont: z.array(z.string().min(1)).default([]),
    catchphrases: z.array(z.string()).default([]),
    disclaimer: z.string().optional(),
  })
  .strict();

export type PersonaCard = z.infer<typeof personaCardSchema>;
