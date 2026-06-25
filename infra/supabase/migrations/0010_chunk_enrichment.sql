-- F1.8: enrichment pipeline (estilo Delphi). Além do chunk raw, indexamos um
-- resumo e perguntas hipotéticas que ele responde — cada um vira uma LINHA em
-- chunks (mesmo creator/document) com seu próprio embedding, ligada ao chunk
-- raw por parent_chunk_id. A busca deduplica por chunk lógico e o LLM continua
-- vendo só o texto raw.
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS enriched_kind text NOT NULL DEFAULT 'raw';
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS parent_chunk_id uuid
  REFERENCES chunks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS chunks_parent_idx ON chunks(parent_chunk_id);
