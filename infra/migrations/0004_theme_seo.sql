-- =====================================================================
-- Faz 5 — Tema, Sayfa, SEO tabloları
--
-- Yeni tablolar (public şemasında, control-plane erişir):
--   themes                 : Tema kataloğu
--   theme_versions         : Semver sürümleri + migration script
--   tenant_theme_assignments : Tenant atamaları (draft/active/archived)
--   navigation_menus       : Header/footer menü tanımı
--   navigation_menu_items  : Menü öğeleri (iç içe, sınırsız)
--   pages                  : Sayfa kaydı
--   page_revisions         : Revizyon (geri alma)
--   page_blocks            : Sıralı bloklar
--   seo_settings           : Tenant bazlı SEO ayarları
--   script_integrations    : Analytics / pixel scriptleri
--   redirect_rules         : URL yönlendirme kuralları
--
-- Tüm tenant_id içeren tablolarda RLS mantığı Faz 2 ile uyumlu (şema bazlı).
-- =====================================================================

-- ----- TEMALAR -----

CREATE TABLE IF NOT EXISTS public.themes (
    id TEXT PRIMARY KEY,                     -- kebab-case: "modern", "classic"
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT 'eticart',
    manifest JSONB NOT NULL,                 -- theme.manifest.json içeriği
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.theme_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theme_id TEXT NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
    version TEXT NOT NULL,                   -- semver
    manifest JSONB NOT NULL,
    migration_script TEXT,                   -- major değişiklikte çalışacak SQL
    changelog TEXT,
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (theme_id, version)
);

CREATE INDEX IF NOT EXISTS theme_versions_theme_idx ON public.theme_versions (theme_id);

-- ----- TENANT TEMA ATAMALARI -----

CREATE TABLE IF NOT EXISTS public.tenant_theme_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    theme_id TEXT NOT NULL REFERENCES public.themes(id),
    theme_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    logo_url TEXT,
    favicon_url TEXT,
    activated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bir tenant için aktif tema yalnız bir tane olabilir.
-- Aktif atama değiştirilirken eski atama arşive düşer (uygulama katmanı).
CREATE UNIQUE INDEX IF NOT EXISTS tenant_theme_active_idx
    ON public.tenant_theme_assignments (tenant_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS tenant_theme_tenant_idx
    ON public.tenant_theme_assignments (tenant_id);

-- ----- MENÜLER -----

CREATE TABLE IF NOT EXISTS public.navigation_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('header', 'footer')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, type)
);

CREATE TABLE IF NOT EXISTS public.navigation_menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID NOT NULL REFERENCES public.navigation_menus(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.navigation_menu_items(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    href TEXT NOT NULL,
    external BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nav_items_menu_idx ON public.navigation_menu_items (menu_id);
CREATE INDEX IF NOT EXISTS nav_items_parent_idx ON public.navigation_menu_items (parent_id);

-- ----- SAYFALAR -----

CREATE TABLE IF NOT EXISTS public.pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL
        CHECK (type IN ('home','category','product','cart','checkout','content','custom')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','published','archived')),
    current_revision_id UUID,
    scheduled_publish_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug, type)
);

CREATE INDEX IF NOT EXISTS pages_tenant_idx ON public.pages (tenant_id);
CREATE INDEX IF NOT EXISTS pages_status_idx ON public.pages (status);

CREATE TABLE IF NOT EXISTS public.page_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    author_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (page_id, version)
);

CREATE INDEX IF NOT EXISTS page_revisions_page_idx ON public.page_revisions (page_id);

CREATE TABLE IF NOT EXISTS public.page_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_revision_id UUID NOT NULL REFERENCES public.page_revisions(id) ON DELETE CASCADE,
    block_id TEXT NOT NULL,
    type TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    visibility_desktop BOOLEAN NOT NULL DEFAULT TRUE,
    visibility_mobile BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_blocks_revision_idx ON public.page_blocks (page_revision_id);

-- Foreign key constraint'i mevcut pages.current_revision_id için ekleyelim.
ALTER TABLE public.pages
    DROP CONSTRAINT IF EXISTS pages_current_revision_fk,
    ADD CONSTRAINT pages_current_revision_fk
        FOREIGN KEY (current_revision_id) REFERENCES public.page_revisions(id)
        DEFERRABLE INITIALLY DEFERRED;

-- ----- SEO -----

CREATE TABLE IF NOT EXISTS public.seo_settings (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    title_template TEXT NOT NULL DEFAULT '%s',
    default_title TEXT NOT NULL DEFAULT '',
    default_description TEXT NOT NULL DEFAULT '',
    default_og_image TEXT,
    robots TEXT NOT NULL DEFAULT 'index, follow',
    sitemap_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    canonical_base TEXT,
    scripts JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ScriptIntegration[]
    hreflang_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    google_site_verification TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- SCRIPT ENTEGRASYONLARI -----

-- Ayrı tablo: admin ekleme/silme için (seo_settings.scripts cache).
CREATE TABLE IF NOT EXISTS public.script_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    position TEXT NOT NULL CHECK (position IN ('head', 'body')),
    kind TEXT NOT NULL CHECK (kind IN ('analytics', 'pixel', 'chat', 'custom')),
    content TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL,                -- admin user id
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS script_integrations_tenant_idx ON public.script_integrations (tenant_id);

-- ----- YÖNLENDİRMELER -----

CREATE TABLE IF NOT EXISTS public.redirect_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    from_path TEXT NOT NULL,
    to_path TEXT NOT NULL,
    status_code SMALLINT NOT NULL DEFAULT 301
        CHECK (status_code IN (301, 302, 307, 308)),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    hit_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, from_path)
);

CREATE INDEX IF NOT EXISTS redirect_rules_tenant_idx ON public.redirect_rules (tenant_id);

-- ----- SEED: HAZIR TEMALAR -----

INSERT INTO public.themes (id, name, description, author, manifest)
VALUES (
    'modern',
    'Modern Mağaza',
    'Büyük görseller, grid layout, çağdaş font (Inter). Hızlı, görsel ağırlıklı e-ticaret için.',
    'eticart',
    '{
        "id": "modern",
        "name": "Modern Mağaza",
        "description": "Büyük görseller, grid layout, çağdaş font (Inter). Hızlı, görsel ağırlıklı e-ticaret için.",
        "author": "eticart",
        "version": "1.0.0",
        "screenshots": [],
        "tokens": {
            "color.primary": "#1f6feb",
            "color.on-primary": "#ffffff",
            "color.background": "#ffffff",
            "color.surface": "#f6f8fa",
            "color.text": "#1c1c1c",
            "color.text-muted": "#5e5e5e",
            "color.border": "#d0d7de",
            "color.accent": "#ff6b6b",
            "font.heading": "Inter, system-ui, sans-serif",
            "font.body": "Inter, system-ui, sans-serif",
            "radius.base": "8px",
            "spacing.scale": "4 8 12 16 24 32 48",
            "variant.header": "mega-menu",
            "variant.footer": "four-column",
            "variant.product-card": "horizontal",
            "variant.category-page": "sidebar-filter",
            "variant.product-gallery": "carousel"
        },
        "layouts": ["default", "minimal"],
        "blocks": ["hero","slider","banner-grid","featured-products","new-products","best-sellers","category-showcase","brand-showcase","countdown","text-image","video-embed","testimonials","blog-list","newsletter","faq","html"],
        "variants": {
            "header": ["mega-menu","classic","transparent"],
            "footer": ["two-column","three-column","four-column"],
            "productCard": ["horizontal","vertical","compact"],
            "categoryPage": ["sidebar-filter","top-filter"],
            "productDetailGallery": ["classic","zoom","carousel"]
        },
        "minPlatformVersion": "5.0.0"
    }'::jsonb
),
(
    'classic',
    'Klasik Mağaza',
    'Geleneksel e-ticaret düzeni, küçük görseller, klasik font (Lato). Yoğun kataloglar için.',
    'eticart',
    '{
        "id": "classic",
        "name": "Klasik Mağaza",
        "description": "Geleneksel e-ticaret düzeni, küçük görseller, klasik font (Lato). Yoğun kataloglar için.",
        "author": "eticart",
        "version": "1.0.0",
        "screenshots": [],
        "tokens": {
            "color.primary": "#8b0000",
            "color.on-primary": "#ffffff",
            "color.background": "#ffffff",
            "color.surface": "#fafafa",
            "color.text": "#222222",
            "color.text-muted": "#666666",
            "color.border": "#dddddd",
            "color.accent": "#d4a017",
            "font.heading": "Lato, Georgia, serif",
            "font.body": "Lato, system-ui, sans-serif",
            "radius.base": "2px",
            "spacing.scale": "4 8 12 16 20 28",
            "variant.header": "classic",
            "variant.footer": "three-column",
            "variant.product-card": "vertical",
            "variant.category-page": "top-filter",
            "variant.product-gallery": "classic"
        },
        "layouts": ["default"],
        "blocks": ["hero","slider","banner-grid","featured-products","new-products","best-sellers","category-showcase","brand-showcase","countdown","text-image","testimonials","blog-list","newsletter","faq"],
        "variants": {
            "header": ["classic","mega-menu"],
            "footer": ["two-column","three-column","four-column"],
            "productCard": ["horizontal","vertical","compact"],
            "categoryPage": ["sidebar-filter","top-filter"],
            "productDetailGallery": ["classic","zoom","carousel"]
        },
        "minPlatformVersion": "5.0.0"
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.theme_versions (theme_id, version, manifest)
VALUES
    ('modern', '1.0.0', (SELECT manifest FROM public.themes WHERE id = 'modern')),
    ('classic', '1.0.0', (SELECT manifest FROM public.themes WHERE id = 'classic'))
ON CONFLICT (theme_id, version) DO NOTHING;