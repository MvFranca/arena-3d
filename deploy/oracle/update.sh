#!/usr/bin/env bash
set -euo pipefail

# Rode DENTRO da VM, na pasta do repo. O GitHub Actions chama este script.
export PATH="/usr/local/bin:${PATH}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=384}"

cd /home/opc/arena
git fetch origin main
git reset --hard origin/main
pnpm install --filter @arena/game-server...
sudo systemctl restart arena-game
sudo systemctl restart caddy
curl -fsS http://127.0.0.1:8080/health
echo
