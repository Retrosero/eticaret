/**
 * Branding Service — Tenant white-label.
 *
 * Her tenant'ın kendi:
 *  - Logo (light + dark)
 *  - Favicon
 *  - Renkleri (primary, secondary, accent, background, text)
 *  - Font ailesi
 *  - Border radius
 *  - Email template ayarları (logo, renk, footer)
 *  - Özel CSS (advanced)
 *
 * Veriler `tenant_settings.branding` JSONB kolonunda tutulur.
 * Storefront tenant context'ten okur, CSS variable olarak inject eder.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ApiError, ErrorCode, type Logger } from '@eticart/config';

import { LOGGER_TOKEN } from '../../common/logger.js';

/** Tenant branding config. */
export interface TenantBranding {
  // Logo / Favicon
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  // Marka adı
  brandName?: string;
  // Renkler
  colors: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
  };
  // Tipografi
  font: {
    family: string;
    headingFamily?: string;
  };
  // Geometri
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  // Email
  email: {
    fromName: string;
    replyTo: string;
    footerText: string;
    logoUrl?: string;
    accentColor?: string;
  };
  // Sosyal medya
  social?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    youtube?: string;
    linkedin?: string;
    tiktok?: string;
  };
  // İletişim
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
    whatsapp?: string;
  };
  // İleri düzey
  customCss?: string;
  // Meta
  updatedAt: string;
}

/** Default branding. */
export const DEFAULT_BRANDING: Omit<TenantBranding, 'updatedAt'> = {
  brandName: 'EtiCart',
  colors: {
    primary: '#1f6feb',
    primaryForeground: '#ffffff',
    secondary: '#6b7280',
    accent: '#f59e0b',
    background: '#ffffff',
    surface: '#f6f8fa',
    text: '#1c1c1c',
    textMuted: '#6b7280',
    border: '#e5e7eb',
  },
  font: {
    family: 'Inter, system-ui, -apple-system, sans-serif',
    headingFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  radius: 'md',
  email: {
    fromName: 'EtiCart',
    replyTo: 'noreply@eticart.com.tr',
    footerText: '© 2026 Eticart. Tüm hakları saklıdır.',
    accentColor: '#1f6feb',
  },
};

/** Hex color validation. */
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

@Injectable()
export class BrandingService {
  constructor(
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
    @Inject('PG_POOL_TOKEN') private readonly pool: Pool,
  ) {}

  /**
   * Tenant branding getir.
   */
  async getBranding(tenantId: string): Promise<TenantBranding> {
    const r = await this.pool.query<{ branding: Record<string, unknown> | null }>(
      `SELECT branding FROM public.tenant_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    const stored = (r.rows[0]?.branding ?? {}) as Partial<TenantBranding>;
    return {
      ...DEFAULT_BRANDING,
      ...stored,
      colors: { ...DEFAULT_BRANDING.colors, ...(stored.colors ?? {}) },
      font: { ...DEFAULT_BRANDING.font, ...(stored.font ?? {}) },
      email: { ...DEFAULT_BRANDING.email, ...(stored.email ?? {}) },
      social: { ...(DEFAULT_BRANDING.social ?? {}), ...(stored.social ?? {}) },
      contact: { ...(DEFAULT_BRANDING.contact ?? {}), ...(stored.contact ?? {}) },
      updatedAt: stored.updatedAt ?? new Date().toISOString(),
    };
  }

  /**
   * Tenant branding güncelle (partial).
   */
  async updateBranding(
    tenantId: string,
    input: Partial<TenantBranding>,
  ): Promise<TenantBranding> {
    // Validation
    if (input.colors) {
      for (const [key, value] of Object.entries(input.colors)) {
        if (typeof value === 'string' && !HEX_COLOR_REGEX.test(value)) {
          throw new ApiError(
            422,
            ErrorCode.VALIDATION_ERROR,
            `Geçersiz renk: ${key} = ${value}. Hex formatında olmalı (#RGB veya #RRGGBB).`,
            { details: { field: `colors.${key}` } as never },
          );
        }
      }
    }
    if (input.radius) {
      const valid = ['none', 'sm', 'md', 'lg', 'xl', 'full'];
      if (!valid.includes(input.radius)) {
        throw new ApiError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `Geçersiz radius: ${input.radius}. Geçerli: ${valid.join(', ')}`,
        );
      }
    }
    if (input.email?.fromName && input.email.fromName.length > 100) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Email gönderici adı 100 karakterden uzun olamaz.',
      );
    }
    if (input.customCss && input.customCss.length > 10000) {
      throw new ApiError(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Özel CSS 10.000 karakterden uzun olamaz.',
      );
    }

    const current = await this.getBranding(tenantId);
    const updated: TenantBranding = {
      ...current,
      ...input,
      colors: { ...current.colors, ...(input.colors ?? {}) },
      font: { ...current.font, ...(input.font ?? {}) },
      email: { ...current.email, ...(input.email ?? {}) },
      social: { ...current.social, ...(input.social ?? {}) },
      contact: { ...current.contact, ...(input.contact ?? {}) },
      updatedAt: new Date().toISOString(),
    };

    // Tenant_settings yoksa oluştur
    await this.pool.query(
      `INSERT INTO public.tenant_settings (tenant_id, branding, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (tenant_id)
       DO UPDATE SET branding = $2::jsonb, updated_at = now()`,
      [tenantId, JSON.stringify(updated)],
    );

    this.logger.info({ tenantId }, 'Tenant branding güncellendi');
    return updated;
  }

  /**
   * Tenant branding CSS variable string.
   * Storefront'un inline style olarak inject edebileceği format.
   */
  async getCssVariables(tenantId: string): Promise<string> {
    const branding = await this.getBranding(tenantId);
    const vars: string[] = [
      `--eticart-color-primary: ${branding.colors.primary};`,
      `--eticart-color-primary-foreground: ${branding.colors.primaryForeground};`,
      `--eticart-color-secondary: ${branding.colors.secondary};`,
      `--eticart-color-accent: ${branding.colors.accent};`,
      `--eticart-color-background: ${branding.colors.background};`,
      `--eticart-color-surface: ${branding.colors.surface};`,
      `--eticart-color-text: ${branding.colors.text};`,
      `--eticart-color-text-muted: ${branding.colors.textMuted};`,
      `--eticart-color-border: ${branding.colors.border};`,
      `--eticart-font-family: ${branding.font.family};`,
      `--eticart-font-heading: ${branding.font.headingFamily ?? branding.font.family};`,
      `--eticart-radius: ${radiusToPx(branding.radius)};`,
    ];
    return `:root{${vars.join(' ')}}`;
  }

  /**
   * Custom domain doğrulama (CNAME + TXT).
   */
  async verifyCustomDomain(tenantId: string, domain: string): Promise<{
    verified: boolean;
    cnameOk: boolean;
    txtOk: boolean;
    message: string;
  }> {
    // CNAME kontrolü: domain → eticart.com.tr veya tenant.eticart.com.tr
    let cnameOk = false;
    try {
      const dns = await import('node:dns/promises');
      const records = await dns.resolveCname(domain);
      const cnameTarget = records[0] ?? '';
      cnameOk =
        cnameTarget.endsWith('.eticart.com.tr') ||
        cnameTarget === 'eticart.com.tr';
    } catch {
      cnameOk = false;
    }

    // TXT doğrulama kaydı
    const verificationToken = `eticart-verify-${tenantId}`;
    let txtOk = false;
    try {
      const dns = await import('node:dns/promises');
      const records = await dns.resolveTxt(`_eticart-verify.${domain}`);
      const flat = records.flat();
      txtOk = flat.includes(verificationToken);
    } catch {
      txtOk = false;
    }

    return {
      verified: cnameOk && txtOk,
      cnameOk,
      txtOk,
      message: cnameOk && txtOk
        ? 'Domain başarıyla doğrulandı.'
        : !cnameOk
          ? 'CNAME kaydı eksik veya hatalı.'
          : 'TXT doğrulama kaydı eksik veya hatalı.',
    };
  }
}

/** Radius → CSS px değeri. */
function radiusToPx(radius: TenantBranding['radius']): string {
  switch (radius) {
    case 'none': return '0px';
    case 'sm': return '0.25rem';
    case 'md': return '0.5rem';
    case 'lg': return '0.75rem';
    case 'xl': return '1rem';
    case 'full': return '9999px';
    default: return '0.5rem';
  }
}
