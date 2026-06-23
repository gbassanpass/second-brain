-- ============================================================================
-- E0.2 — Extras não geráveis pelo Drizzle:
--   1. Trigger que mantém `chunks.tsv` em sincronia com `chunks.text` (português).
--   2. Bucket `creator-content` no Supabase Storage (mídia bruta por creator_id).
-- ============================================================================

-- 1. tsvector trigger (busca BM25-like via ts_rank em `chunks.tsv`).
--    Drizzle não modela trigger; e usar GENERATED ALWAYS AS engessaria a
--    definição (não pode mudar configuração de linguagem sem recriar a coluna).
CREATE OR REPLACE FUNCTION chunks_tsv_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('portuguese', COALESCE(NEW.text, ''));
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS chunks_tsv_trigger ON chunks;
--> statement-breakpoint
CREATE TRIGGER chunks_tsv_trigger
BEFORE INSERT OR UPDATE OF text ON chunks
FOR EACH ROW EXECUTE FUNCTION chunks_tsv_update();
--> statement-breakpoint

-- 2. Bucket de Storage para mídia bruta do criador.
--    Path convention: creator/{creator_id}/raw/{document_id}.{ext} (ver docs/04).
--    Mantemos `public = false` — uploads são acessados via signed URLs do backend.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creator-content',
  'creator-content',
  false,
  524288000, -- 500 MiB
  ARRAY[
    'text/plain', 'text/markdown', 'application/pdf',
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
    'video/mp4', 'video/quicktime'
  ]
) ON CONFLICT (id) DO NOTHING;
