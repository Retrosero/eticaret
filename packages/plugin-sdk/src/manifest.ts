/**
 * Plugin Manifest v2 — Semver + Capability + Permission.
 *
 * v2'de eklenenler:
 * - engineVersion (min/max EtiCart version)
 * - capabilities (network, storage, db)
 * - permissions (declarative permissions)
 * - signedBy (imza doğrulama — Faz 23.5)
 * - dependencies (plugin-to-plugin)
 * - breaking (true ise otomatik rollback)
 */
import { z } from 'zod';

// ───────────────────────────────────────────────────────────
// CAPABILITY (plugin'in ihtiyaç duyduğu runtime özellikler)
// ───────────────────────────────────────────────────────────

export const CapabilitySchema = z.enum([
  'network.http',         // Dış HTTP çağrısı (Trendyol API, vb.)
  'network.https',
  'storage.read',         // Tenant storage'dan dosya oku
  'storage.write',        // Tenant storage'a dosya yaz
  'db.read',              // DB read (analytics için)
  'db.write',             // DB write (analytics insert)
  'email.send',           // Tenant adına email gönder
  'sms.send',             // SMS gönder
  'webhook.receive',      // Webhook al
  'cron.scheduled',       // Zamanlı görev
  'cache.read',           // Redis oku
  'cache.write',          // Redis yaz
]);

export type PluginCapability = z.infer<typeof CapabilitySchema>;

// ───────────────────────────────────────────────────────────
// PERMISSION (declarative — kullanıcı onayı)
// ───────────────────────────────────────────────────────────

export const PermissionSchema = z.enum([
  'product.read',
  'product.write',
  'order.read',
  'order.write',
  'customer.read',
  'customer.write',
  'payment.read',
  'payment.refund',
  'analytics.read',
  'webhook.manage',
  'settings.read',
  'settings.write',
]);

export type PluginPermission = z.infer<typeof PermissionSchema>;

// ───────────────────────────────────────────────────────────
// SEMVER VALIDATION
// ───────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/;

export function isValidSemver(v: string): boolean {
  return SEMVER_RE.test(v);
}

/**
 * Semver karşılaştırma: -1, 0, 1.
 * "1.2.3" vs "1.2.4" → -1
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  if (!isValidSemver(a) || !isValidSemver(b)) {
    throw new Error(`Geçersiz semver: ${a} veya ${b}`);
  }
  const parse = (v: string) => {
    const [main, pre] = v.split('-');
    const parts = main!.split('.').map(Number);
    return { major: parts[0]!, minor: parts[1]!, patch: parts[2]!, pre: pre ?? null };
  };
  const va = parse(a);
  const vb = parse(b);
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  // Pre-release: "1.0.0-alpha" < "1.0.0"
  if (va.pre && !vb.pre) return -1;
  if (!va.pre && vb.pre) return 1;
  if (va.pre && vb.pre) return va.pre < vb.pre ? -1 : va.pre > vb.pre ? 1 : 0;
  return 0;
}

/**
 * Engine version kontrolü: plugin'in min/max EtiCart versiyonu.
 * "eticartVersion": ">=1.5.0 <2.0.0"
 */
export interface EngineVersionRange {
  min: string;          // Minimum versiyon (örn. "1.5.0")
  max?: string;         // Maksimum versiyon (opsiyonel)
}

export function parseEngineVersion(spec: string): EngineVersionRange {
  // ">=1.5.0 <2.0.0" veya ">=1.5.0" veya "^1.5.0"
  const cleaned = spec.replace(/\s+/g, ' ').trim();
  const range: EngineVersionRange = { min: '0.0.0' };

  if (cleaned.startsWith('^')) {
    // ^1.5.0 → >=1.5.0 <2.0.0
    const v = cleaned.slice(1);
    if (isValidSemver(v)) {
      range.min = v;
      const [major] = v.split('.');
      range.max = `${Number(major) + 1}.0.0`;
    }
  } else if (cleaned.startsWith('~')) {
    // ~1.5.0 → >=1.5.0 <1.6.0
    const v = cleaned.slice(1);
    if (isValidSemver(v)) {
      range.min = v;
      const [major, minor] = v.split('.');
      range.max = `${major}.${Number(minor) + 1}.0`;
    }
  } else {
    const geMatch = cleaned.match(/>=(\d+\.\d+\.\d+)/);
    if (geMatch) range.min = geMatch[1]!;
    const ltMatch = cleaned.match(/<(\d+\.\d+\.\d+)/);
    if (ltMatch) range.max = ltMatch[1]!;
  }
  return range;
}

export function isEngineCompatible(engineRange: string, currentVersion: string): boolean {
  const range = parseEngineVersion(engineRange);
  if (compareSemver(currentVersion, range.min) < 0) return false;
  if (range.max && compareSemver(currentVersion, range.max) >= 0) return false;
  return true;
}

// ───────────────────────────────────────────────────────────
// PLUGIN MANIFEST v2 SCHEMA
// ───────────────────────────────────────────────────────────

export const PluginManifestV2Schema = z.object({
  /** Plugin benzersiz kodu */
  code: z.string().regex(/^eticart-plugin-[a-z0-9-]+$/, 'Geçersiz plugin kodu'),
  /** Görünen ad */
  name: z.string().min(2).max(100),
  /** Kısa açıklama */
  description: z.string().min(10).max(500),
  /** Kategori */
  category: z.enum([
    'marketplace', 'payment', 'shipping',
    'integration', 'analytics', 'marketing', 'utility',
  ]),
  /** Versiyon (semver) */
  version: z.string().refine(isValidSemver, 'Geçersiz semver versiyonu'),
  /** Engine versiyonu: "^1.5.0" veya ">=1.5.0 <2.0.0" */
  eticartVersion: z.string().min(1),
  /** Yazar */
  author: z.string().min(2).max(100),
  /** Lisans */
  license: z.string().min(2).max(50),
  /** Slug (subdomain-friendly) */
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Geçersiz slug'),
  /** Logo URL */
  logoUrl: z.string().url().optional(),
  /** Marketplace ekran görüntüleri */
  screenshots: z.array(z.string().url()).max(10).optional(),
  /** Plan bazlı fiyatlandırma */
  pricing: z.object({
    monthlyKurus: z.number().int().min(0),
    yearlyKurus: z.number().int().min(0),
    hasTrial: z.boolean(),
    minPlan: z.enum(['starter', 'growth', 'business', 'enterprise']).optional(),
  }).nullable().optional(),
  /** Plugin slot'ları */
  slots: z.array(z.object({
    type: z.enum(['payment.gateway', 'shipping.carrier', 'marketplace.adapter']),
    handler: z.string().min(1),
    priority: z.number().int().optional(),
    meta: z.record(z.unknown()).optional(),
  })),
  /** Plugin hook'ları */
  hooks: z.array(z.object({
    event: z.string().min(1),
    handler: z.string().min(1),
    priority: z.number().int().optional(),
    continueOnError: z.boolean().optional(),
  })).optional(),
  /** Konfigürasyon şeması */
  configSchema: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    type: z.enum(['text', 'password', 'number', 'boolean', 'select']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
  })).optional(),
  /** Marketplace tag'leri */
  tags: z.array(z.string()).max(10).optional(),

  // ─── v2 ALANLARI ───
  /** Plugin'in ihtiyaç duyduğu runtime capabilities */
  capabilities: z.array(CapabilitySchema).default([]),
  /** Plugin'in ihtiyaç duyduğu permissions (tenant onayı) */
  permissions: z.array(PermissionSchema).default([]),
  /** Plugin imzalayan anahtar ID (Faz 23.5) */
  signedBy: z.string().optional(),
  /** Plugin bağımlılıkları (kod → min versiyon) */
  dependencies: z.record(z.string()).optional(),
  /** Breaking change flag (rollback için) */
  breaking: z.boolean().default(false),
  /** Public key (imza doğrulama) */
  publicKey: z.string().optional(),
  /** Changelog URL */
  changelog: z.string().url().optional(),
});

export type PluginManifestV2 = z.infer<typeof PluginManifestV2Schema>;