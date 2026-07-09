-- 0002_seed_control.sql
-- Kontrol düzlemine iki örnek domain seed edilir.
-- Bu script idempotent: ON CONFLICT ile tekrar çalıştırılabilir.

INSERT INTO tenants (tenant_id, slug, primary_domain, schema_name, plan, status)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a', 'firma-a.local', 'tenant_a', 'pro', 'active'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b', 'firma-b.local', 'tenant_b', 'starter', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tenant_domains (tenant_id, domain, is_primary)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'firma-a.local', TRUE),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'www.firma-a.local', FALSE),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'firma-b.local', TRUE),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'www.firma-b.local', FALSE)
ON CONFLICT (domain) DO NOTHING;
