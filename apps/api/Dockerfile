# syntax=docker/dockerfile:1.7
# Build context is the REPOSITORY ROOT (the API depends on the @support-saas/shared-types workspace):
#   docker build -f apps/api/Dockerfile -t support-saas-api .

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ---------------------------------------------------------------------------
# Manifests only, so the dependency layer is cached until a package.json changes.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/

FROM manifests AS deps
RUN npm ci --workspace=@support-saas/api --workspace=@support-saas/shared-types --include-workspace-root=false

# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build --workspace=@support-saas/shared-types \
 && cd apps/api && npx prisma generate && npm run build

# Development target: source is bind-mounted by docker-compose.
FROM build AS development
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
FROM manifests AS prod-deps
RUN npm ci --omit=dev --workspace=@support-saas/api --workspace=@support-saas/shared-types --include-workspace-root=false

FROM base AS production
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/index.js"]
