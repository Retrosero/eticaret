# Multi-stage Dockerfile — storefront (Next.js standalone)

FROM node:20-alpine AS deps
RUN corepack enable pnpm
WORKDIR /repo
COPY pnpm-workspace.yaml package.json turbo.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --filter @eticart/storefront... --frozen-lockfile || pnpm install --filter @eticart/storefront...

FROM node:20-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo ./
RUN pnpm --filter @eticart/storefront build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /repo/apps/storefront/.next/standalone ./
COPY --from=builder /repo/apps/storefront/.next/static ./.next/static
COPY --from=builder /repo/apps/storefront/public ./public
COPY --from=builder /repo/apps/storefront/package.json ./

RUN addgroup -g 1001 app && adduser -S -u 1001 -G app app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
