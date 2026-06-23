# Makefile fino sobre pnpm + supabase + docker-compose.
# Veja docs/08-setup-and-env.md para detalhes de cada alvo.

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose -f infra/docker-compose.yml

.PHONY: help up down dev test lint format typecheck migrate migrate-gen seed eval ingest-fausto clean

help: ## Lista os alvos disponíveis
	@awk 'BEGIN {FS = ":.*##"; printf "\nAlvos disponíveis:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

up: ## Sobe Redis (docker-compose) + Supabase CLI
	$(COMPOSE) up -d
	@command -v supabase >/dev/null 2>&1 && (cd infra/supabase && supabase start) || echo "[warn] supabase CLI não instalado — instale com: brew install supabase/tap/supabase"

down: ## Para Redis + Supabase
	@command -v supabase >/dev/null 2>&1 && (cd infra/supabase && supabase stop) || true
	$(COMPOSE) down

dev: ## Backend + frontend em watch
	pnpm dev

test: ## Roda todos os testes (backend + frontend)
	pnpm test

lint: ## Lint (Biome)
	pnpm lint

format: ## Formata com Biome
	pnpm format

typecheck: ## Type-check em todos os workspaces
	pnpm typecheck

migrate: ## Aplica migrations no Supabase (usa DATABASE_URL_DIRECT)
	@echo "[migrate] implementado no E0.2 (drizzle-kit migrate)"

migrate-gen: ## Gera migration a partir do schema Drizzle
	@echo "[migrate-gen] implementado no E0.2 (drizzle-kit generate)"

seed: ## Cria criador 'fausto' + Persona Card + buckets de Storage
	@echo "[seed] implementado no E0.2/E1"

eval: ## Roda o harness de avaliação do RAG (golden questions)
	@echo "[eval] implementado no E4"

ingest-fausto: ## ManualUploadConnector lê data/fausto/ e ingere
	@echo "[ingest-fausto] implementado no E1.2"

clean: ## Remove node_modules e build artifacts
	rm -rf node_modules backend/node_modules frontend/node_modules
	rm -rf backend/dist frontend/.next
