-- F1.20: cache de perguntas sugeridas (autocomplete dinâmico no chat).
-- Geradas a partir do grafo do clone no job de background (kg-build) e lidas
-- pelo empty-state do chat. JSONB = array de strings.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS suggested_questions jsonb;
