-- ============================================================================
-- E5.3 — Idempotência do webhook de billing.
--
-- O webhook `POST /api/billing/webhook` (docs/06 §Billing) recebe eventos do
-- provedor (Stripe no MVP; Hotmart/Kiwify por trás da mesma interface) e faz
-- upsert em `subscriptions`. A chave de idempotência é o par
-- (provider, external_id) — o `external_id` é o id da assinatura no provedor
-- (ex.: `sub_...` do Stripe). Reprocessar o mesmo evento atualiza o row em vez
-- de duplicar.
--
-- Observação: rows sem `external_id` (seed/teste) continuam permitidos — em
-- SQL UNIQUE valores NULL são tratados como distintos, então múltiplos
-- (provider, NULL) coexistem sem violar a constraint.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_external_id_uq
  ON public.subscriptions (provider, external_id);
