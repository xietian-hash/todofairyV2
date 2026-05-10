FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api ./apps/api

RUN pnpm --filter @todo-fairy/api prisma:generate
RUN pnpm --filter @todo-fairy/api build

FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS runtime

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm --filter @todo-fairy/api prisma:generate

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @todo-fairy/api start:prod"]
