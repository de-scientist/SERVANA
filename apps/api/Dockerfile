# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

# ---- deps (workspace-aware) ----
FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/ ./packages/ 2>/dev/null || true
RUN npm ci --workspace=apps/api --include-workspace-root=false 2>/dev/null || npm ci
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma 2>/dev/null || true

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages 2>/dev/null || true
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build --workspace=apps/api 2>/dev/null || npx nest build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat curl \
  && addgroup -S servana && adduser -S servana -G servana
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./package.json
RUN chown -R servana:servana /app
USER servana
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/v1/health || exit 1
# Apply pending migrations, then boot. Never runs `migrate dev` in prod.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main.js"]
