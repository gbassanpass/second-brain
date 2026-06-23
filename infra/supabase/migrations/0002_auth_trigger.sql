-- ============================================================================
-- E5.1 — Replicação de novos usuários do Supabase Auth para `public.users`.
--
-- A tabela `auth.users` é gerenciada pelo GoTrue (Supabase Auth). Sempre que
-- alguém faz signup (email/magic link ou OAuth), um row novo aparece lá. O
-- trigger abaixo cria a contrapartida em `public.users` para que o resto do
-- esquema (conversations, messages, subscriptions, …) possa fazer FK pela
-- nossa própria tabela sem depender do schema interno do Auth.
--
-- Convenção (docs/04 + docs/07 §E5.1):
--   - `external_id` (text) recebe o `auth.users.id::text`.
--   - `role` default `subscriber`. Criadores/operadores são promovidos
--     manualmente via SQL ou via uma futura tela admin.
-- ============================================================================

-- Função executada como SECURITY DEFINER pra atravessar o RLS de
-- `public.users` (o role anon não tem INSERT). search_path fixado em public
-- pra evitar injeção via tabelas homônimas em schemas locais.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (external_id, email, role)
  VALUES (NEW.id::text, NEW.email, 'subscriber')
  ON CONFLICT (external_id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
