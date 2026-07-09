/**
 * Minimal şablon motoru.
 *
 * Handlebars benzeri `{{degisken}}` sözdizimi. Veri güvenliği için tüm
 * değerler HTML escape edilir.
 *
 * Örnek:
 *   template: "Merhaba {{customerName}}, siparişiniz: {{orderNumber}}"
 *   variables: { customerName: "Ali", orderNumber: "TRD-001" }
 *   → "Merhaba Ali, siparişiniz: TRD-001"
 */

/** HTML escape. */
export function htmlEscape(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Değerden path ile nested değer çek (örn: "user.name"). */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/** Basit helper — para formatı. */
export function formatCurrency(value: number, currency = 'TRY'): string {
  const num = Number(value);
  if (isNaN(num)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
    }).format(num);
  } catch {
    // Bilinmeyen currency kodu için fallback
    return `${num.toFixed(2)} ${currency}`;
  }
}

/** Basit helper — tarih formatı. */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Bir şablonu değişkenlerle doldurur.
 *
 * Desteklenen sözdizimleri:
 *   - {{degisken}}              → HTML escape
 *   - {{{degisken}}}            → Raw (escape yok)
 *   - {{degisken | helper}}     → Helper: | currency, | date, | upper, | lower
 *   - {{#if degisken}}...{{/if}} → Koşullu
 *
 * Yardımcılar:
 *   - {{tutar | currency:"TRY"}}
 *   - {{tarih | date}}
 *   - {{ad | upper}}
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  options: { htmlEscape?: boolean } = {},
): string {
  const escape = options.htmlEscape !== false;

  // Koşullu blok: {{#if expr}}...{{/if}}
  let result = template.replace(
    /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, condition: string, content: string) => {
      const value = getByPath(variables, condition.trim());
      const truthy =
        value && (typeof value !== 'object' || Object.keys(value).length > 0);
      return truthy ? content : '';
    },
  );

  // Değişkenler — helper ve escape destekli
  result = result.replace(
    /\{\{\{([^}]+)\}\}\}|\{\{([^}]+)\}\}/g,
    (_match, rawExpr: string | undefined, expr: string | undefined) => {
      const isRaw = !!rawExpr;
      const expression = ((rawExpr ?? expr) ?? '').trim();

      // Helper parse: "degisken | helper:arg"
      const parts = expression.split('|').map((s) => s.trim());
      const path = parts[0] ?? '';
      const helpers = parts.slice(1);
      let value = getByPath(variables, path);

      // Helper'ları uygula
      for (const helper of helpers) {
        const [helperName, ...args] = helper.split(':').map((s) => s.trim());
        switch (helperName) {
          case 'currency':
            value = formatCurrency(Number(value), args[0] ?? 'TRY');
            break;
          case 'date':
            value = formatDate(String(value));
            break;
          case 'upper':
            value = String(value).toUpperCase();
            break;
          case 'lower':
            value = String(value).toLowerCase();
            break;
          case 'default':
            if (!value && args[0]) value = args[0];
            break;
        }
      }

      if (isRaw || !escape) {
        return String(value ?? '');
      }
      return htmlEscape(value);
    },
  );

  return result;
}

/** Şablon adı + değişkenlerden tam e-posta içeriği üretir. */
export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderEmailTemplate(
  template: { subject: string; text: string; html: string },
  variables: Record<string, unknown>,
): RenderedEmail {
  return {
    subject: renderTemplate(template.subject, variables, { htmlEscape: false }),
    text: renderTemplate(template.text, variables, { htmlEscape: false }),
    html: renderTemplate(template.html, variables, { htmlEscape: true }),
  };
}