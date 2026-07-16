# Multi-stage Dockerfile — control-plane (NestJS)
# Üretim için alpine imajı

# 1) İnşa (deps + derleme)
FROM node:20-alpine AS builder
RUN corepack enable pnpm
RUN corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# Önce tüm workspace için bağımlılıkları kur (cache'i optimize et)
COPY pnpm-workspace.yaml package.json turbo.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/control-plane ./apps/control-plane
# apps/* içindeki bağımlılıklar workspace:* olduğu için tüm apps'i de kopyalamak gerekebilir
COPY apps ./apps

RUN pnpm install --filter @eticart/control-plane... --frozen-lockfile || pnpm install --filter @eticart/control-plane...

# Workspace paketleri derlenmeden uygulama derlenemez; Turbo bağımlılık
# grafiğini (^) izleyerek gerekli dist çıktıları önce üretir.
RUN pnpm turbo run build --filter=@eticart/control-plane

# 2) Çalışma
FROM node:20-alpine AS runner
WORKDIR /repo/apps/control-plane

ENV NODE_ENV=production
ENV PORT=4000

# Sadece çalışma için gereken dosyaları al
COPY --from=builder /repo /repo

# Güvenlik: root olmayan kullanıcı
RUN addgroup -g 1001 app && adduser -S -u 1001 -G app app
USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:4000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
