# @eticart/tenant-context

Domain → tenant çözümleme kütüphanesi.

Bu paket, Faz 0'da oluşturulan PoC'nin (`faz0-poc/src/tenant-resolver.ts`) Faz 1 monorepo yapısına taşınmış halidir. **Faz 2'de** kalıcı veri kaynağı (Postgre `pg_control.tenants` + `tenant_domains`) ile entegre edilecektir.

## Önemli kural

`x-tenant-id` gibi istemci tarafı sahte başlıklarına **güvenilmez**. Yalnızca `Host` (veya doğrulanmış sunucu tarafı başlığı) üzerinden çözümleme yapılır.

Bkz. ADR-001 §3 ve `docs/adr/ADR-001-multitenancy.md`.
