FROM node:20-alpine AS deps
RUN corepack enable pnpm
RUN corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml package.json turbo.json pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --filter @eticart/super-admin... --frozen-lockfile || pnpm install --filter @eticart/super-admin...

FROM node:20-alpine AS builder
RUN corepack enable pnpm && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY --from=deps /repo ./
RUN pnpm --filter @eticart/ui build && pnpm --filter @eticart/super-admin build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /repo/apps/super-admin/.next/standalone ./
COPY --from=builder /repo/apps/super-admin/.next/static ./.next/static
COPY --from=builder /repo/apps/super-admin/public ./public
COPY --from=builder /repo/apps/super-admin/package.json ./
RUN addgroup -g 1001 app && adduser -S -u 1001 -G app app
USER app
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3002/health || exit 1
CMD ["node", "server.js"]
