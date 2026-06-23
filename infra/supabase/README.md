# infra/supabase

Configuração do projeto Supabase local + migrations geradas pelo Drizzle Kit.

## Status (E0.1)

Esta pasta é um placeholder. A configuração real (`config.toml`, buckets de Storage,
políticas de Auth) é criada no **E0.2**, junto com o schema Drizzle.

## Inicializar (E0.2)

```bash
cd infra/supabase
supabase init        # cria config.toml + estrutura básica
supabase start       # sobe Postgres 16 + pgvector + Auth + Storage locais
```

Depois do `supabase start`, o CLI imprime as chaves locais — copie para o `.env`
do projeto (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`DATABASE_URL`, `DATABASE_URL_DIRECT`).

## Migrations

As migrations SQL ficam em `infra/supabase/migrations/`, geradas com:

```bash
pnpm --filter @second-brain/backend drizzle-kit generate
```

E aplicadas com `make migrate` (que usa `DATABASE_URL_DIRECT`).
