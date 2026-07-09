-- =====================================================================
-- Geliştirme seed verisi (yalnızca NODE_ENV=development'ta çalışır).
-- İki örnek tenant ekler.
-- =====================================================================

INSERT INTO public.tenants (slug, name, status, plan, primary_domain)
VALUES
    ('firma-a', 'Firma A Mağazası', 'active', 'starter', 'firma-a.local'),
    ('firma-b', 'Firma B Mağazası', 'active', 'starter', 'firma-b.local')
ON CONFLICT (slug) DO UPDATE SET updated_at = NOW();

INSERT INTO public.tenant_domains (tenant_id, domain, is_primary)
SELECT id, 'firma-a.local', TRUE FROM public.tenants WHERE slug = 'firma-a'
ON CONFLICT (domain) DO NOTHING;

INSERT INTO public.tenant_domains (tenant_id, domain, is_primary)
SELECT id, 'firma-b.local', TRUE FROM public.tenants WHERE slug = 'firma-b'
ON CONFLICT (domain) DO NOTHING;
