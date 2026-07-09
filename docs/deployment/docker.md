# Dağıtım — Local Docker Compose (Geliştirme)

Yalnızca Faz 1 altyapı servislerini (Postgres, Redis, MailHog, MinIO)
ayağa kaldırır.

## Çalıştırma

```bash
# 1) Kök .env hazırla
cp .env.example .env

# 2) Servisleri başlat
pnpm docker:dev
# veya doğrudan:
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml up

# 3) Bittiğinde
pnpm docker:down
```

## Servis Adresleri

| Servis    | Host       | Port | Web UI / Bilgi |
|-----------|------------|------|----------------|
| Postgres  | localhost  | 5432 | `psql -h localhost -U eticart -d eticart_control` |
| Redis     | localhost  | 6379 | `redis-cli -h localhost` |
| MailHog   | localhost  | 1025 | Web UI: http://localhost:8025 |
| MinIO     | localhost  | 9000 | API; Konsol: http://localhost:9001 (minio / minio12345) |

## Veri Kalıcılığı

Veriler compose volumes'da saklanır:

- `eticart-postgres-data`
- `eticart-redis-data`
- `eticart-minio-data`

Toplu silmek için: `docker volume rm eticart-postgres-data eticart-redis-data eticart-minio-data`.
