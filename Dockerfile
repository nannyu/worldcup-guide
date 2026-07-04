# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.9
ARG NODE_VERSION=22-alpine

FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json bun.lock ./
COPY vendor/ ./vendor/
RUN bun install --frozen-lockfile

FROM deps AS builder
ARG NEXT_PUBLIC_EAZO_APP_ID
ENV NEXT_OUTPUT_STANDALONE=true \
    NEXT_PUBLIC_EAZO_APP_ID=${NEXT_PUBLIC_EAZO_APP_ID}
COPY . .
RUN bun run build

FROM node:${NODE_VERSION} AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /app/data \
    && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

FROM deps AS worker
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --chown=bun:bun . .
RUN mkdir -p data && chown -R bun:bun /app/data
USER bun
CMD ["bun", "run", "worker"]
