# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/web --include-workspace-root=false 2>/dev/null || npm ci

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
COPY packages ./packages 2>/dev/null || true
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime (standalone) ----
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl \
  && addgroup -S servana && adduser -S servana -G servana
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/public ./public
COPY --from=build --chown=servana:servana /app/apps/web/.next/standalone ./
COPY --from=build --chown=servana:servana /app/apps/web/.next/static ./.next/static
USER servana
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
