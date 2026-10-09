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

# O Rapier demora alguns segundos para abrir a porta nesta VM.
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS http://127.0.0.1:8080/health; then
    ok=1
    break
  fi
  sleep 2
done
echo
if [[ "$ok" != 1 ]]; then
  sudo journalctl -u arena-game -n 30 --no-pager
  exit 1
fi
