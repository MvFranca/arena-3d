#!/usr/bin/env bash
set -euo pipefail

# Rode dentro da VM depois que os arquivos novos já estão em /home/opc/arena.
# A VM não tem git. Quem envia o código é o GitHub Actions.
export PATH="/usr/local/bin:${PATH}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=384}"

cd /home/opc/arena
pnpm install --filter @arena/game-server...
sudo systemctl restart arena-game
sudo systemctl restart caddy
curl -fsS http://127.0.0.1:8080/health
echo
