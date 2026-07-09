# @eticart/infra-scripts

Migration, seed ve tenant provision script'leri.

## Komutlar

```bash
# Migration'ları uygula (0001 → 000n)
pnpm --filter @eticart/infra-scripts migrate

# Geliştirme seed verisini yükle
pnpm --filter @eticart/infra-scripts seed

# Yeni tenant aç
pnpm --filter @eticart/infra-scripts provision <slug> [name] [plan]
```

## Idempotentlik

- Tüm `*.sql` dosyaları `IF NOT EXISTS` veya benzeri korumalarla yazılır.
- `provision` komutu `ON CONFLICT` ile aynı `slug` ile çağrılırsa mevcut tenant'ı günceller (UUID değişmez).
- `kvkk_audit` her iki şemada da yazılır; ayrı bir denetim tablosu ile kontrol edilir.
