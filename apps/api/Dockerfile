# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

# ---------------------------------------------------------------------------
FROM deps AS development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
USER node
CMD ["node", "dist/index.js"]
