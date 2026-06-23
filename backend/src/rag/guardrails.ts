export type GuardrailFlag = 'investment' | 'safety' | null;

export type GuardrailConfidence = 'high' | 'medium' | 'low';

export interface GuardrailDecision {
  flag: GuardrailFlag;
  confidence: GuardrailConfidence;
  signals: string[];
}

interface NamedPattern {
  name: string;
  re: RegExp;
}

/**
 * Stage-1 (rules) classifier for investment intent — docs/05 §Guardrails.
 *
 * Two pattern groups feed the decision:
 *   - `ACTION_PATTERNS`: phrasings that ask for a buy/sell/allocate decision.
 *     One hit → high-confidence flag.
 *   - `FINANCIAL_TERMS`: nouns/adjectives anchoring a financial topic.
 *     Two+ hits → medium; one hit → low.
 *
 * The flag is conservative on purpose: when in doubt, the orchestrator
 * routes to educational mode (E3.2) rather than a refusal — false positives
 * still yield a useful answer; false negatives leak CVM risk.
 */
const ACTION_PATTERNS: NamedPattern[] = [
  // "que/qual cripto/ação/etc devo comprar/vender/investir"
  {
    name: 'pick_to_act',
    re: /\b(que|qual|quais)\b[^?.!]{0,80}\b(comprar|vender|investir|aplicar|aportar|alocar)\b/i,
  },
  // "vale a pena comprar/investir/aplicar (em X)"
  {
    name: 'is_it_worth',
    re: /\bvale\s+a\s+pena\b[^?.!]{0,40}\b(comprar|vender|investir|aplicar|aportar)\b/i,
  },
  // "onde investir/aplicar/aportar"
  { name: 'where_invest', re: /\bonde\b[^?.!]{0,20}\b(investir|aplicar|aportar)\b/i },
  // "quanto alocar/investir/aportar/colocar"
  {
    name: 'how_much_invest',
    re: /\bquant[oa]s?\b[^?.!]{0,30}\b(alocar|investir|aportar|aplicar|colocar)\b/i,
  },
  // "Xx% em/na/no <ativo>" / "porcentagem (da|do) (carteira|portfólio)"
  {
    name: 'percent_alloc',
    re: /(\b\d{1,3}\s?%\s+(em|na|no|de)\b|porcentagem\s+(da|do)\s+(carteira|portf[óo]lio))/i,
  },
  // "trocar X por Y" (rebalanceio)
  { name: 'swap_asset', re: /\btrocar\s+\w+\s+por\s+\w+\b/i },
  // "comprar/vender/aplicar em <ativo>" — direct order
  {
    name: 'direct_order',
    re: /\b(comprar|vender|aplicar\s+em|aportar\s+em|investir\s+em)\s+(bitcoin|btc|ethereum|eth|crypto|cripto|d[óo]lar|euro|ouro|im[óo]vel|tesouro|cdb|lci|lca|fii|etf|bdr|a[çc][õo]es?)\b/i,
  },
  // English "should I buy/sell" — common in PT-BR queries from techy users
  { name: 'should_buy', re: /\bshould\s+i\s+(buy|sell|invest)/i },
];

const FINANCIAL_TERMS: NamedPattern[] = [
  {
    name: 'crypto',
    re: /\b(bitcoin|btc|ethereum|eth|altcoin|shitcoin|defi|nft|stablecoin|cripto(?:moedas?)?)\b/i,
  },
  {
    name: 'equity',
    re: /\b(a[çc][ãa]o|a[çc][õo]es|papel|pap[ée]is|bolsa|ibovespa|nasdaq|stocks?|ticker|day\s?trade)\b/i,
  },
  {
    name: 'fixed_income',
    re: /\b(tesouro\s+(direto|ipca|selic|prefixado)|cdb|lci|lca|cri|cra|deb[êe]nture|renda\s+fixa)\b/i,
  },
  {
    name: 'fund',
    re: /\b(fii|etf|bdr|fundo\s+(imobili[áa]rio|de\s+investimento|multimercado))\b/i,
  },
  {
    name: 'fx_commodity',
    re: /\b(d[óo]lar|euro|libra|c[âa]mbio|ouro|prata|com[óo]dities?)\b/i,
  },
  {
    name: 'return_metric',
    re: /\b(rentabilidade|dividendos?|yield|retorno|valoriza[çc][ãa]o|juros\s+compostos)\b/i,
  },
  {
    name: 'portfolio',
    re: /\b(aporte|aportar|alocar|portf[óo]lio|carteira\s+(de\s+investimento|recomendada)?)\b/i,
  },
];

/**
 * Stage-3 (post-generation) filter for the investment guardrail — docs/05 §1.
 *
 * Scans the LLM reply for the unambiguous shapes of a direct buy/sell/allocate
 * order. Patterns are intentionally narrow so they don't fire on:
 *   - the user's own quoted question (e.g. "eu devo comprar" — first person),
 *   - the EDUCATIONAL_MODE_PREAMBLE that the orchestrator prepends (its
 *     placeholders "compre X / venda Y / aloque Z%" use letters, not assets
 *     or digits),
 *   - educational paraphrases ("antes de decidir comprar, considere...").
 *
 * When a match fires, the orchestrator regenerates with a reinforced preamble
 * (one retry) and, if it still violates, falls back to a canned educational
 * reply — see services/chat.ts.
 */
export interface RecommendationDetection {
  violated: boolean;
  matches: string[];
}

const RECOMMENDATION_PATTERNS: NamedPattern[] = [
  // P1 — imperative verb + financial asset ("compre Bitcoin", "venda dólar",
  // "invista em FII"). Asset list intentionally mirrors `FINANCIAL_TERMS` so a
  // direct order on any tracked instrument fires.
  {
    name: 'imperative_asset',
    re: /\b(compre|venda|invista|aplique|aporte|aloque|reserve|coloque|ponha)\s+(?:em\s+|por\s+)?\d*\s?%?\s*(bitcoin|btc|ethereum|eth|cripto(?:moedas?)?|crypto|d[óo]lar|euro|libra|ouro|prata|im[óo]vel|im[óo]veis|tesouro|cdb|lci|lca|cri|cra|deb[êe]nture|fii|etf|bdr|a[çc][õo]es?|a[çc][ãa]o|fundo|fundos)\b/i,
  },
  // P2 — imperative verb + percentage ("aloque 30%", "invista 50%"). Catches
  // the "aloque X%" pattern even when the asset is not named.
  {
    name: 'imperative_percent',
    re: /\b(aloque|aplique|coloque|ponha|reserve|invista|aporte)\s+\d{1,3}\s?%/i,
  },
  // P3 — explicit personal recommendation ("recomendo comprar Y", "sugiro
  // investir em X"). 60-char window to allow short qualifiers.
  {
    name: 'explicit_recommend',
    re: /\b(recomendo|sugiro|aconselho|indico)\b[^.!?\n]{0,60}\b(comprar|vender|investir|aplicar|aportar|alocar|adquirir)\b/i,
  },
  // P4 — "você deve(ria) comprar/vender/...". 2nd-person form is the giveaway
  // — first-person ("eu devo comprar") in the user echo doesn't match.
  {
    name: 'you_should',
    re: /\bvoc[êe]\s+(?:deve(?:ria)?|precisa|tem\s+que)\s+(comprar|vender|investir|aplicar|aportar|alocar|adquirir)\b/i,
  },
];

export function detectDirectRecommendation(rawText: string): RecommendationDetection {
  const text = rawText.normalize('NFC');
  if (!text.trim()) return { violated: false, matches: [] };
  const matches = RECOMMENDATION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
  return { violated: matches.length > 0, matches };
}

/**
 * Anti-hallucination post-check (E3.4): when the orchestrator handed chunks
 * to the LLM, a substantive reply MUST include at least one `[N]` citation
 * marker. Otherwise the model is asserting facts without grounding — exactly
 * what docs/05 §Guardrails §3 forbids.
 *
 * `minLength` is a guard against false positives on short refusals
 * ("não tenho isso registrado") or the canned safe-educational reply.
 * Default 200 chars covers anything resembling an actual answer.
 */
export interface CitationCheck {
  violated: boolean;
  reason: 'no_citation_marker' | null;
}

const CITATION_RE = /\[\d+\]/;

export function detectMissingCitations(
  rawText: string,
  opts: { hadChunks: boolean; minLength?: number },
): CitationCheck {
  const minLength = opts.minLength ?? 200;
  if (!opts.hadChunks) return { violated: false, reason: null };
  const text = rawText.trim();
  if (text.length < minLength) return { violated: false, reason: null };
  if (CITATION_RE.test(text)) return { violated: false, reason: null };
  return { violated: true, reason: 'no_citation_marker' };
}

export function detectInvestmentIntent(rawQuery: string): GuardrailDecision {
  const query = rawQuery.normalize('NFC');
  if (!query.trim()) {
    return { flag: null, confidence: 'low', signals: [] };
  }

  const actions = ACTION_PATTERNS.filter((p) => p.re.test(query));
  const terms = FINANCIAL_TERMS.filter((p) => p.re.test(query));

  if (actions.length > 0) {
    return {
      flag: 'investment',
      confidence: 'high',
      signals: [...actions.map((p) => `action:${p.name}`), ...terms.map((p) => `term:${p.name}`)],
    };
  }
  if (terms.length >= 2) {
    return {
      flag: 'investment',
      confidence: 'medium',
      signals: terms.map((p) => `term:${p.name}`),
    };
  }
  if (terms.length === 1) {
    return {
      flag: 'investment',
      confidence: 'low',
      signals: terms.map((p) => `term:${p.name}`),
    };
  }
  return { flag: null, confidence: 'low', signals: [] };
}
