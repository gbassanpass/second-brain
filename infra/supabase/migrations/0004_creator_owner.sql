-- ============================================================================
-- F1.x — Self-signup do criador: dono do clone.
--
-- Cada criador criado pelo fluxo de onboarding pertence ao usuário que o criou
-- (`owner_user_id` → public.users.id). Nulo para criadores legados (seed do
-- fausto). O enforcement "cada criador vê/edita só o seu" usa esta coluna no
-- backend (operadores furam a checagem).
-- ============================================================================

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.users(id);
