# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 remains installed for the existing local SQLite workflow.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
  && npm rebuild better-sqlite3

FROM deps AS builder
WORKDIR /app
COPY . .

# Docker builds target PostgreSQL. Local development still uses prisma/schema.prisma (SQLite).
ENV LOW_MEMORY=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_MAX_OLD_SPACE_SIZE=640
ENV PRISMA_SCHEMA=prisma/schema.postgres.prisma
ENV PRISMA_MIGRATIONS=prisma/migrations-postgres
ENV DATABASE_URL=postgresql://tabletap:tabletap_password@postgres:5432/tabletap
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PRISMA_SCHEMA=prisma/schema.postgres.prisma
ENV PRISMA_MIGRATIONS=prisma/migrations-postgres

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data/payments \
  && chown -R node:node /app

COPY --from=builder --chown=node:node /app ./

USER node
EXPOSE 3000

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
