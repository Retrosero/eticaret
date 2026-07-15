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
RUN pnpm --filter @eticart/commerce-backend build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9000

COPY --from=builder /repo/apps/commerce-backend/.medusa ./.medusa 2>/dev/null || true
COPY --from=builder /repo/apps/commerce-backend/dist ./dist
COPY --from=builder /repo/apps/commerce-backend/package.json ./
COPY --from=builder /repo/apps/commerce-backend/node_modules ./node_modules

RUN addgroup -g 1001 app && adduser -S -u 1001 -G app app
USER app

EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:9000/health || exit 1

CMD ["node", "dist/main.js"]
