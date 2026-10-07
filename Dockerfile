# Game server only — sem client/api pra caber no free tier (512MB).
FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Workspace mínimo (só o que o game server precisa)
COPY package.json pnpm-lock.yaml ./
RUN printf '%s\n' \
  'packages:' \
  '  - apps/game-server' \
  '  - packages/*' \
  '' \
  'allowBuilds:' \
  '  esbuild: true' \
  '' \
  'onlyBuiltDependencies:' \
  '  - esbuild' \
  > pnpm-workspace.yaml

COPY apps/game-server/package.json apps/game-server/
COPY packages/protocol/package.json packages/protocol/
COPY packages/sim/package.json packages/sim/
COPY tsconfig.base.json ./
COPY apps/game-server apps/game-server
COPY packages/protocol packages/protocol
COPY packages/sim packages/sim

# Sem --frozen-lockfile: o workspace do Docker é menor que o do repo.
RUN pnpm install --filter @arena/game-server...

ENV NODE_ENV=production
ENV PORT=8080
ENV ALLOW_ANON=true
ENV NODE_OPTIONS=--max-old-space-size=384

EXPOSE 8080

WORKDIR /app/apps/game-server
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
