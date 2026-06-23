# 01 — Especificação de Produto

## Visão
Plataforma que transforma o conhecimento de um criador num assistente de IA conversacional ("clone"), acessível pela audiência por texto e voz, com monetização por assinatura. Foco: Brasil, português nativo, criadores de conhecimento/atualidade.

## Por que existe (problema)
Criadores não escalam: respondem as mesmas perguntas, não conseguem dar atenção 1:1 à audiência, e monetizam mal o relacionamento. O clone responde 24/7 no estilo do criador e cria um produto de assinatura.

## Diferencial vs. Delphi (não copiar, recortar)
- **Brasil-first:** português, WhatsApp como canal nº 1, checkout BR (Hotmart/Kiwify).
- **Monetização nativa em todos os planos** (a Delphi só libera no topo).
- **Conformidade embutida:** guardrail anti-recomendação de investimento (CVM) + consentimento de voz/imagem.
- **Vertical estreito primeiro:** criadores de conhecimento/atualidade (tipo Fausto), não horizontal genérico.

## Cliente 0: Fausto Bassan
- ~86k seguidores no Instagram, nicho "explico o mundo sem torcer": geopolítica, política, ciência, fé, empreendedorismo (dono da Challot Jeans).
- Conteúdo: Reels com forte gancho, temas do noticiário, opinião analítica neutra.
- O clone dele deve: explicar acontecimentos sem viés, apoiar decisões de vida, refletir sobre fé/valores. **NUNCA** recomendar investimento.

## Escopo do MVP (Fase 0) — o que ENTRA
1. Ingestão (semi-manual ok) do conteúdo do Fausto → second brain.
2. Chat de texto com RAG + persona do Fausto.
3. Guardrail anti-investimento + disclaimer.
4. Paywall: clone só para assinantes.
5. Logging completo de conversas e custo.

## O que NÃO entra no MVP (non-goals da Fase 0)
- Painel self-service para qualquer criador (Fase 2).
- Voz (Fase 1).
- App mobile nativo.
- Múltiplos canais simultâneos (começa com web; WhatsApp na Fase 1).
- Mind Visualization (pós-MVP — ver doc 09).

## Personas de uso
- **Assinante (fã):** quer entender o mundo "como o Fausto explicaria", tirar dúvidas, refletir sobre decisões.
- **Criador (Fausto):** quer configurar, revisar o que o clone diz, ver analytics, receber a receita.
- **Operador (você):** onboarda criadores, monitora qualidade e custo.

## Monetização
- Assinatura recorrente da comunidade/clone (R$19–49/mês no piloto).
- Planos futuros (Fase 2): Free / Criador (R$97–149) / Pro com voz (R$297–397) / Enterprise.
- Billing recorrente via checkout BR; a plataforma controla acesso via webhook de pagamento.

## Princípios de produto (da entrevista do CEO da Delphi — ver doc 10)
- **Mídia conversacional:** o consumo migra do feed para a conversa; o clone é a interface.
- **Autenticidade verificada é o moat** (não a tecnologia): só clones de pessoas reais e autorizadas, com verificação de identidade e selo de "mente oficial".
- **Regra "só de si mesmo":** um usuário só cria o clone dele próprio.
- **Voz retém ~5x mais que texto:** priorizar voz no plano Pro mais cedo (ainda fora do MVP, mas no topo da Fase 1).
- **Não enganar:** sempre deixar claro que é a mente digital, não a pessoa.
- **Política de uso:** sem políticos, sem conteúdo adulto.
- **Interview mode:** onboarding por perguntas direcionadas eleva a fidelidade com pouco dado (ver doc 10).

## Métricas de sucesso do MVP
- ≥ 50 assinantes pagantes do clone do Fausto em 60 dias.
- Custo por conversa < US$0,05 (texto).
- ≥ 70% das respostas avaliadas como "soa como o Fausto" no harness de avaliação.
- Churn mensal < 8%.
