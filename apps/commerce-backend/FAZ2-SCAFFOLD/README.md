# Faz 2 İskeletleri

Bu klasördeki dosyalar **Faz 2'de** `apps/commerce-backend/src/` altına
aktarılacak ve Medusa 2.x paketleri kurulduktan sonra derlenecek.

Şu anda **derleme dışı** tutulurlar (TypeScript include edilmez).

## Aktarım Adımları (Faz 2 başlangıcında)

```bash
# 1) Medusa bağımlılıklarını ekle
cd apps/commerce-backend
# @medusajs/framework, @medusajs/medusa, @medusajs/cache-redis, vb.

# 2) Bu klasörü src/ altına taşı
cp -r FAZ2-SCAFFOLD/api ../../packages/../apps/commerce-backend/src/api
cp -r FAZ2-SCAFFOLD/scripts ../../packages/../apps/commerce-backend/src/scripts
cp FAZ2-SCAFFOLD/medusa-config.ts ../apps/commerce-backend/medusa-config.ts

# 3) src/main.ts içeriğini Medusa bootstrap'ı ile değiştir
```

## Dosya İçerikleri

- `medusa-config.ts` — Medusa yapılandırması (Postgres + Redis + CORS)
- `api/health/route.ts` — `/health` özel route
- `api/ready/route.ts` — `/ready` özel route
- `scripts/seed.ts` — `medusa exec` seed betiği
