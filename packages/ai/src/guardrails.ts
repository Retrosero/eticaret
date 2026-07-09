/**
 * AI Guardrails — güvenlik kontrolleri.
 *
 * - Prompt injection tespiti
 * - PII (kişisel bilgi) maskeleme
 * - Output validation
 * - Toxic content filter
 */

// ───────────────────────────────────────────────────────────
// PII PATTERNS (TR ağırlıklı)
// ───────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ name: string; regex: RegExp; mask: string }> = [
  // IBAN önce (kredi kartı pattern'i IBAN'ın bir kısmını yakalayabilir)
  {
    name: 'iban',
    regex: /\bTR\d{2}\s?(?:\d{4}[\s]?){5}\d{2}\b/gi,
    mask: '[IBAN]',
  },
  // TC Kimlik No
  { name: 'tc_kimlik', regex: /\b[1-9]\d{10}\b/g, mask: '[TC_KIMLIK]' },
  // E-posta
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, mask: '[EMAIL]' },
  // Kredi kartı (16 haneli, gruplu olabilir) — IBAN'dan sonra
  { name: 'credit_card', regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, mask: '[KART_NO]' },
  // Telefon (TR)
  {
    name: 'phone',
    regex: /\b(?:\+90|0)?\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g,
    mask: '[TELEFON]',
  },
];

/**
 * Metinden PII bilgileri maskele.
 */
export function maskPii(text: string): { masked: string; detected: string[] } {
  let masked = text;
  const detected: string[] = [];
  for (const p of PII_PATTERNS) {
    if (p.regex.test(masked)) {
      detected.push(p.name);
      masked = masked.replace(p.regex, p.mask);
    }
    p.regex.lastIndex = 0;
  }
  return { masked, detected };
}

// ───────────────────────────────────────────────────────────
// PROMPT INJECTION DETECTION
// ───────────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions?/i,
  /disregard\s+(previous|above|all)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*:\s*/i,
  /forget\s+(everything|all)/i,
  /\bdan\b\s+mode/i, // "Do Anything Now"
  /\bjailbreak\b/i,
  /reveal\s+(your|the)\s+(system|initial)\s+prompt/i,
  /print\s+(your|the)\s+(system|initial)\s+prompt/i,
];

export interface InjectionCheckResult {
  safe: boolean;
  riskScore: number; // 0-1
  patterns: string[];
}

/**
 * Prompt injection kontrolü.
 */
export function detectInjection(text: string): InjectionCheckResult {
  const matched: string[] = [];
  let riskScore = 0;
  for (const p of INJECTION_PATTERNS) {
    // Reset lastIndex for global regex (defensive)
    p.lastIndex = 0;
    if (p.test(text)) {
      matched.push(p.source);
      riskScore += 0.6; // Her eşleşme yeterince yüksek
    }
  }
  // Aşırı uzun input (DoS)
  if (text.length > 50_000) riskScore += 0.4;
  return {
    safe: riskScore < 0.5,
    riskScore: Math.min(1, riskScore),
    patterns: matched,
  };
}

// ───────────────────────────────────────────────────────────
// TOXIC CONTENT FILTER
// ───────────────────────────────────────────────────────────

const TOXIC_KEYWORDS_TR = [
  'aptal',
  'salak',
  'gerizekalı',
  'hıyar',
  'orospu',
  'piç',
  'yavşak',
  'amcık',
  'siktir',
  'ananı',
];

/**
 * Basit toxic content kontrolü (production'da moderation API).
 */
export function detectToxic(text: string): { toxic: boolean; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = TOXIC_KEYWORDS_TR.filter((kw) => lower.includes(kw));
  return { toxic: matched.length > 0, matched };
}

// ───────────────────────────────────────────────────────────
// OUTPUT VALIDATION
// ───────────────────────────────────────────────────────────

export interface OutputValidation {
  valid: boolean;
  reason?: string;
  cleanedOutput: string;
}

/**
 * AI çıktısını validate et.
 * - Çok kısa → geçersiz
 * - PII içeriyorsa maskele
 * - Toxic ise reddet
 */
export function validateOutput(output: string, minLength = 5): OutputValidation {
  if (output.length < minLength) {
    return { valid: false, reason: 'Output çok kısa', cleanedOutput: output };
  }
  const toxic = detectToxic(output);
  if (toxic.toxic) {
    return {
      valid: false,
      reason: `Output toxic içerik barındırıyor: ${toxic.matched.join(', ')}`,
      cleanedOutput: '',
    };
  }
  const pii = maskPii(output);
  return {
    valid: true,
    cleanedOutput: pii.masked,
  };
}

// ───────────────────────────────────────────────────────────
// PRE-FLIGHT CHECK (input)
// ───────────────────────────────────────────────────────────

export interface PreFlightResult {
  safe: boolean;
  sanitizedInput: string;
  warnings: string[];
}

/**
 * LLM'e gönderilecek input'u sanitize et.
 * 1. PII maskele
 * 2. Injection kontrol
 * 3. Toxic içerik reddi
 */
export function preFlight(input: string): PreFlightResult {
  const warnings: string[] = [];

  // PII mask
  const pii = maskPii(input);
  if (pii.detected.length > 0) {
    warnings.push(`PII maskelendi: ${pii.detected.join(', ')}`);
  }

  // Injection
  const inj = detectInjection(input);
  if (!inj.safe) {
    warnings.push(`Olası prompt injection (risk: ${(inj.riskScore * 100).toFixed(0)}%)`);
  }

  // Toxic
  const tox = detectToxic(input);
  if (tox.toxic) {
    warnings.push(`Toxic içerik: ${tox.matched.join(', ')}`);
  }

  return {
    safe: inj.safe && !tox.toxic,
    sanitizedInput: pii.masked,
    warnings,
  };
}