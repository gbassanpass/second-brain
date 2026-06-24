 Manual ponta-a-ponta (a experiência do usuário)

  # 1. dados do Fausto
  make seed            # cria 'fausto' + Persona Card
  make ingest-fausto   # ingere data/fausto/
  make worker &        # indexa (embeddings) — precisa do Redis

  # 2. sobe os apps (frontend precisa das envs NEXT_PUBLIC_*)
  ANON=$(grep SUPABASE_ANON_KEY .env | cut -d= -f2)
  pnpm --filter @second-brain/backend dev &
  NEXT_PUBLIC_API_URL=http://localhost:3001 \
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON \
  BILLING_PROVIDER=fake \
  pnpm --filter @second-brain/frontend dev &
  Depois, no navegador:


 1. Landing → http://localhost:3000/c/fausto
  2. Login → /login: digita um e-mail → o magic link aparece no Mailpit em http://localhost:54324 (clica nele).
  3. Chat → volta em /c/fausto/chat: como assinante sem assinatura, aparece o paywall (402) → "Assinar" abre o checkout fake. Para liberar
  de fato, o webhook ativa a assinatura (no fake local você simula com o POST /api/billing/webhook que testamos), ou promove o user a
  operator/creator.
  4. Studio → /studio/fausto: precisa de papel creator/operator. Promove via SQL:
  docker exec -i supabase_db_supabase psql -U postgres -d postgres \
    -c "UPDATE public.users SET role='operator' WHERE email='SEU_EMAIL';"
  4. Aí vê Persona editor, fontes, conteúdo indexado e os analytics cards.