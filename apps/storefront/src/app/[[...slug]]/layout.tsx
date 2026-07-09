/**
 * Catch-all tenant layout.
 *
 * Bu layout Next.js App Router'ın en üst seviyesinde olduğu için tüm
 * sayfa istekleri buradan geçer. Tenant domain'den çözümlenir, tema
 * yüklenir, gerekli CSS / metadata enjekte edilir.
 *
 * Server Component olarak çalışır; tüm alt sayfalarda tema aktif olur.
 */

import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  getThemeStyleTags,
  getGoogleFontLink,
  getCacheTags,
} from '@eticart/theme-engine/runtime/index.js';
import { loadTheme, ensureDefaultAssignment } from '../../../lib/theme/loader.js';
import { demoData } from '../../../lib/theme/demo-data.js';
import { ThemeHeader, ThemeFooter, themeClass } from '../../../lib/theme/dispatcher.js';
import { resolveStorefrontTenant } from '../../../lib/theme/tenant-resolver.js';

// Header'ların host'tan çözümlenebilmesi için dynamic rendering.
export const dynamic = 'force-dynamic';
// Next.js Cache API: tag-based invalidation
export const revalidate = 300;

interface LayoutProps {
  children: ReactNode;
}

export default async function TenantLayout({ children }: LayoutProps) {
  ensureDefaultAssignment();

  const headerStore = await headers();
  const host = headerStore.get('host') ?? headerStore.get('x-forwarded-host') ?? 'demo.eticart.local';
  const tenantCtx = await resolveStorefrontTenant(host);
  if (!tenantCtx) {
    notFound();
  }

  const { theme, sdk: _sdk } = await loadTheme({
    ctx: tenantCtx,
    demoData,
  });

  const fontLink = getGoogleFontLink(theme);
  const styleTags = getThemeStyleTags(theme);
  const cacheTags = getCacheTags(theme);
  // cacheTags'i ileride Next.js revalidateTag ile kullanılacak (örn. webhook)
  void cacheTags;

  return (
    <div className={themeClass(theme.manifest.id)}>
      {/* Kritik CSS: design token'lar (header'da render-blocking ama küçük boyut) */}
      <style
        id="theme-tokens"
        dangerouslySetInnerHTML={{ __html: styleTags }}
      />
      {/* Google Fonts */}
      {fontLink && (
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      )}
      {fontLink && (
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      )}
      {fontLink && <link rel="stylesheet" href={fontLink} />}

      {/* SEO script entegrasyonları (admin tarafından eklenmiş) */}
      {theme.seo.scripts
        .filter((s) => s.position === 'head' && s.kind)
        .map((s, idx) => (
          <script
            key={`head-${idx}`}
            type={s.kind === 'analytics' ? 'text/javascript' : undefined}
            dangerouslySetInnerHTML={{ __html: s.content }}
          />
        ))}

      <ThemeHeader theme={theme} menu={theme.headerMenu} />

      <main className="theme-main">{children}</main>

      <ThemeFooter theme={theme} menu={theme.footerMenu} />

      {/* Body sonu scriptler */}
      {theme.seo.scripts
        .filter((s) => s.position === 'body')
        .map((s, idx) => (
          <script
            key={`body-${idx}`}
            type={s.kind === 'analytics' ? 'text/javascript' : undefined}
            dangerouslySetInnerHTML={{ __html: s.content }}
          />
        ))}
    </div>
  );
}