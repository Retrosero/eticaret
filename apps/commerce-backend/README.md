# @eticart/commerce-backend (Faz 1 — Medusa iskeleti)

> **Not:** Faz 1'de Medusa bağımlılıkları **kurulmamıştır**. Bunun nedeni
> Faz 1 kapsamında yalnızca "boş ama çalışan" iskeletlerin hedeflenmiş
> olması ve Medusa'nın 100+ paketlik yoğun bağımlılık ağacının Faz 1
> için erken bir yük oluşturmasıdır.
>
> Faz 2'de Medusa 2.x kurulacak ve `medusa-config.ts`, `/store/*`, `/admin/*`
> Medusa tarafından sağlanacaktır. `src/api/health` ve `src/api/ready`
> Medusa özel route'larına taşınacaktır. Aşağıdaki **Faz 2 paket listesi**
> kurulumla eklenecek:
>
> ```json
> {
>   "@medusajs/framework": "^2.4.0",
>   "@medusajs/medusa": "^2.4.0",
>   "@medusajs/cache-redis": "^2.4.0",
>   "@medusajs/event-bus-local": "^2.4.0",
>   "awilix": "^8.0.1"
> }
> ```
>
> Faz 1'de bu paket şu anda minimal HTTP placeholder (`src/main.ts`)
> ve şu Medusa iskeletlerini barındırır:
>
> - `medusa-config.ts` — yorumlu tarafta, Faz 2'de aktifleştirilecek.
> - `src/api/health/route.ts` — Medusa özel route iskeleti.
> - `src/api/ready/route.ts` — Medusa özel route iskeleti.
> - `src/scripts/seed.ts` — `medusa exec` ile çalıştırılacak taslak.

## Faz 1'de Çalıştırma

```bash
pnpm --filter @eticart/commerce-backend dev
# -> "Medusa Faz 2'de kurulacak. Şu anda sadece iskelet mevcut."

pnpm --filter @eticart/commerce-backend build
node apps/commerce-backend/dist/main.js
# -> /health ve /ready endpoint'leri dinlemede
```
