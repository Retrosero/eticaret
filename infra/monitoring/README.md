# Monitoring

Faz 1'de bu klasör yalnızca Prometheus için örnek yapılandırma içerir.

Üretim gözlem yığını (Faz 5+):

- **OpenTelemetry** — dağıtık izleme (`packages/observability/src/tracing.ts`)
- **Prometheus** — metrik toplama (`prometheus.yml`)
- **Grafana** — görselleştirme
- **Loki** — merkezi log çöplüğü (opsiyonel)
- **Sentry** — hata izleme (opsiyonel, `SENTRY_DSN` env'i)

## Ölçümler (Faz 2+)

- HTTP yanıt süreleri (p95, p99)
- HTTP durum kodları
- DB sorgu süreleri
- Redis cache hit/miss
- Throttler 429 sayıları
