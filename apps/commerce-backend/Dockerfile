# Multi-stage Dockerfile — commerce-backend (Medusa)

FROM node:20-alpine AS builder
RUN corepack enable pnpm
RUN corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json turbo.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --filter @eticart/commerce-backend... --frozen-lockfile || pnpm install --filter @eticart/commerce-backend...
RUN pnpm --filter @eticart/commerce-backend prisma generate
RUN pnpm turbo run build --filter=@eticart/commerce-backend

FROM node:20-alpine AS runner
WORKDIR /repo/apps/commerce-backend
ENV NODE_ENV=production
ENV PORT=9000

COPY --from=builder /repo /repo

RUN addgroup -g 1001 app && adduser -S -u 1001 -G app app
USER app

EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:9000/health || exit 1

CMD ["node", "dist/main.js"]
