# Game server (WebSocket + tick 60 Hz). Cliente fica no Vercel.
FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/client/package.json apps/client/
COPY apps/game-server/package.json apps/game-server/
COPY packages/protocol/package.json packages/protocol/
COPY packages/sim/package.json packages/sim/
COPY tsconfig.base.json ./
COPY apps/game-server apps/game-server
COPY packages/protocol packages/protocol
COPY packages/sim packages/sim

RUN pnpm install --frozen-lockfile --filter @arena/game-server...

ENV NODE_ENV=production
ENV PORT=8080
ENV ALLOW_ANON=true

EXPOSE 8080

WORKDIR /app/apps/game-server
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
