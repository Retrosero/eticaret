-- =====================================================================
-- Faz 3 — Auth seed
-- Roller ve izin seed verisi
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissions (atomik yetki tanımları)
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (code, category, description) VALUES
    -- Ürün
    ('product:read','product','Ürün listeleme ve görüntüleme'),
    ('product:create','product','Yeni ürün oluşturma'),
    ('product:update','product','Ürün güncelleme'),
    ('product:delete','product','Ürün silme'),
    ('product:import','product','Toplu ürün içe aktarma'),
    ('product:export','product','Toplu ürün dışa aktarma'),
    -- Sipariş
    ('order:read','order','Sipariş listeleme'),
    ('order:create','order','Yeni sipariş oluşturma (manuel)'),
    ('order:update','order','Sipariş güncelleme'),
    ('order:cancel','order','Sipariş iptal etme'),
    ('order:refund','order','Sipariş iade işlemi'),
    -- Müşteri
    ('customer:read','customer','Müşteri listeleme'),
    ('customer:create','customer','Yeni müşteri oluşturma'),
    ('customer:update','customer','Müşteri güncelleme'),
    ('customer:delete','customer','Müşteri silme'),
    ('customer:export','customer','Müşteri verisi dışa aktarma'),
    -- Stok
    ('inventory:read','inventory','Stok görüntüleme'),
    ('inventory:update','inventory','Stok güncelleme'),
    ('inventory:transfer','inventory','Depolar arası transfer'),
    -- Rapor
    ('report:sales','report','Satış raporları'),
    ('report:financial','report','Mali raporlar'),
    ('report:export','report','Rapor dışa aktarma'),
    -- Yönetim
    ('settings:read','settings','Mağaza ayarları görüntüleme'),
    ('settings:update','settings','Mağaza ayarları güncelleme'),
    ('user:read','user','Kullanıcı listeleme'),
    ('user:create','user','Yeni kullanıcı oluşturma'),
    ('user:update','user','Kullanıcı güncelleme'),
    ('user:delete','user','Kullanıcı silme'),
    ('role:assign','user','Rol atama'),
    -- Entegrasyon
    ('integration:read','integration','Entegrasyon listeleme'),
    ('integration:manage','integration','Entegrasyon yönetimi'),
    -- Pazarlama
    ('campaign:read','campaign','Kampanya listeleme'),
    ('campaign:manage','campaign','Kampanya yönetimi'),
    ('coupon:manage','campaign','Kupon yönetimi')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Roles (sistem rolleri)
-- ---------------------------------------------------------------------
INSERT INTO public.roles (code, label, description, scope) VALUES
    ('super_admin', 'Süper Admin', 'SaaS platform sahibi — tüm tenant''lara erişim', 'super_admin'),
    ('tenant_owner', 'Firma Sahibi', 'Tenant içinde her şeyi yapabilir', 'tenant'),
    ('tenant_admin', 'Firma Yöneticisi', 'Tenant yönetimi — geniş yetki', 'tenant'),
    ('tenant_manager', 'Firma Yöneticisi (Matris)', 'Yetki matrisi ile sınırlandırılmış', 'tenant'),
    ('product_manager', 'Ürün Yöneticisi', 'Ürünler, kategoriler, stok', 'tenant'),
    ('order_manager', 'Sipariş Sorumlusu', 'Siparişler, kargolar', 'tenant'),
    ('accountant', 'Muhasebe', 'Faturalar, iadeler, raporlar', 'tenant'),
    ('warehouse_staff', 'Depo Personeli', 'Stok, sevkiyat', 'tenant'),
    ('marketing', 'Pazarlama', 'Kampanyalar, kuponlar', 'tenant'),
    ('support', 'Destek Personeli', 'Müşteri destek', 'tenant'),
    ('customer', 'B2C Müşteri', 'Son kullanıcı', 'customer'),
    ('dealer', 'B2B Bayi', 'Bayi kullanıcısı', 'customer')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Role → Permission eşleme
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r_id UUID;
    p_id UUID;
    perm_code TEXT;
BEGIN
    -- super_admin: tüm izinler
    SELECT id INTO r_id FROM public.roles WHERE code = 'super_admin';
    FOR perm_code IN SELECT code FROM public.permissions LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- tenant_owner: tüm izinler
    SELECT id INTO r_id FROM public.roles WHERE code = 'tenant_owner';
    FOR perm_code IN SELECT code FROM public.permissions LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- tenant_admin: tenant_owner ile aynı (tenant_manager, tenant_owner ayrımı sonradan geliyor)
    SELECT id INTO r_id FROM public.roles WHERE code = 'tenant_admin';
    FOR perm_code IN SELECT code FROM public.permissions LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- tenant_manager: belirli izinler
    SELECT id INTO r_id FROM public.roles WHERE code = 'tenant_manager';
    FOREACH perm_code IN ARRAY ARRAY[
        'product:read','product:create','product:update','product:delete','product:export',
        'order:read','order:create','order:update','order:cancel',
        'customer:read','customer:update','customer:export',
        'inventory:read','inventory:update',
        'report:sales','report:financial','report:export',
        'settings:read','user:read','user:create','user:update',
        'integration:read','campaign:read','campaign:manage','coupon:manage'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- product_manager
    SELECT id INTO r_id FROM public.roles WHERE code = 'product_manager';
    FOREACH perm_code IN ARRAY ARRAY[
        'product:read','product:create','product:update','product:delete','product:import','product:export',
        'inventory:read'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- order_manager
    SELECT id INTO r_id FROM public.roles WHERE code = 'order_manager';
    FOREACH perm_code IN ARRAY ARRAY[
        'order:read','order:create','order:update','order:cancel',
        'customer:read','inventory:read','inventory:transfer'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- accountant
    SELECT id INTO r_id FROM public.roles WHERE code = 'accountant';
    FOREACH perm_code IN ARRAY ARRAY[
        'order:read','order:refund','report:sales','report:financial','report:export','customer:read'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- warehouse_staff
    SELECT id INTO r_id FROM public.roles WHERE code = 'warehouse_staff';
    FOREACH perm_code IN ARRAY ARRAY[
        'inventory:read','inventory:update','inventory:transfer','product:read','order:read'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- marketing
    SELECT id INTO r_id FROM public.roles WHERE code = 'marketing';
    FOREACH perm_code IN ARRAY ARRAY[
        'campaign:read','campaign:manage','coupon:manage','product:read','customer:read','report:sales'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- support
    SELECT id INTO r_id FROM public.roles WHERE code = 'support';
    FOREACH perm_code IN ARRAY ARRAY[
        'order:read','customer:read','customer:update','product:read'
    ] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- customer (B2C)
    SELECT id INTO r_id FROM public.roles WHERE code = 'customer';
    FOREACH perm_code IN ARRAY ARRAY['order:read'] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;

    -- dealer (B2B)
    SELECT id INTO r_id FROM public.roles WHERE code = 'dealer';
    FOREACH perm_code IN ARRAY ARRAY['order:read','order:create'] LOOP
        SELECT id INTO p_id FROM public.permissions WHERE code = perm_code;
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (r_id, p_id) ON CONFLICT DO NOTHING;
    END LOOP;
END $$;