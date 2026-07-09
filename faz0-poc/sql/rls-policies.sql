-- rls-policies.sql
-- Postgre RLS politikaları — ADR-001'in "RLS hazırlığı" gereksinimi.
--
-- Seçenek B (izinlenen) fiziksel ayrımı kullanır; bu SQL, ileride
-- Seçenek A'ya dönmek gerekirse diye şemaları RLS-hazır hale getirir.
--
-- Bu script IF NOT EXISTS kullanmaz çünkü RLS CREATE POLICY mevcutsa DROP+CREATE
-- yapısını gerektirir. Bunun yerine DO blokları ile idempotent hale getirilmiştir.

SET search_path TO tenant_a, public;

-- tenant_a.customers için RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'tenant_a' AND tablename = 'customers'
    ) THEN
        RAISE NOTICE 'tenant_a.customers bulunamadı, RLS atlandı (schema scriptini çalıştırın önce)';
        RETURN;
    END IF;

    ALTER TABLE tenant_a.customers ENABLE ROW LEVEL SECURITY;

    -- tenant_id = current_setting('app.current_tenant')::uuid politikası
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'tenant_a' AND tablename = 'customers' AND policyname = 'tenant_a_isolation'
    ) THEN
        CREATE POLICY tenant_a_isolation ON tenant_a.customers
            USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
            WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='tenant_a' AND tablename='products') THEN
        ALTER TABLE tenant_a.products ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='tenant_a' AND tablename='products' AND policyname='tenant_a_isolation'
        ) THEN
            CREATE POLICY tenant_a_isolation ON tenant_a.products
                USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
        END IF;
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='tenant_a' AND tablename='orders') THEN
        ALTER TABLE tenant_a.orders ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='tenant_a' AND tablename='orders' AND policyname='tenant_a_isolation'
        ) THEN
            CREATE POLICY tenant_a_isolation ON tenant_a.orders
                USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
        END IF;
    END IF;
END
$$;

SET search_path TO tenant_b, public;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='tenant_b' AND tablename='customers') THEN
        ALTER TABLE tenant_b.customers ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='tenant_b' AND tablename='customers' AND policyname='tenant_b_isolation'
        ) THEN
            CREATE POLICY tenant_b_isolation ON tenant_b.customers
                USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
        END IF;
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='tenant_b' AND tablename='products') THEN
        ALTER TABLE tenant_b.products ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='tenant_b' AND tablename='products' AND policyname='tenant_b_isolation'
        ) THEN
            CREATE POLICY tenant_b_isolation ON tenant_b.products
                USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
        END IF;
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='tenant_b' AND tablename='orders') THEN
        ALTER TABLE tenant_b.orders ENABLE ROW LEVEL SECURITY;
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname='tenant_b' AND tablename='orders' AND policyname='tenant_b_isolation'
        ) THEN
            CREATE POLICY tenant_b_isolation ON tenant_b.orders
                USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
                WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
        END IF;
    END IF;
END
$$;

-- NOT: Bu PoC için Postgre owner rolü (app_owner) BYPASSRLS'ye sahip.
-- RLS'nin gerçekten sorguları kısıtlamasını görmek için uygulama
-- bağlantısı RLS_APP_USER gibi "non-superuser, non-owner" bir rol ile
-- yapılmalıdır. ADR-001 §6 R1 — bu PoC'de RLS hazırlığı "yapıldı", uygulama
-- rolünün bağlanması Faz 1'de ele alınacaktır.
