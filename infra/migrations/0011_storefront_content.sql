-- Storefront ana sayfa içerikleri. Tüm kayıtlar tenant-scoped'dur.

CREATE TABLE IF NOT EXISTS public.storefront_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    placement TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    image_key TEXT NOT NULL,
    image_mobile_key TEXT,
    cta_label TEXT,
    cta_href TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS storefront_banners_lookup_idx
    ON public.storefront_banners (tenant_id, placement, status, sort_order);

CREATE TABLE IF NOT EXISTS public.storefront_blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    image_key TEXT,
    published_at TIMESTAMPTZ,
    reading_time_min INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS storefront_blog_lookup_idx
    ON public.storefront_blog_posts (tenant_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.storefront_testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_title TEXT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    avatar_key TEXT,
    approved_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS storefront_testimonials_lookup_idx
    ON public.storefront_testimonials (tenant_id, status, approved_at DESC);
