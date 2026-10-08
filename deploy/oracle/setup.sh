#!/usr/bin/env bash
set -euo pipefail

# Rode na VM Oracle (Ubuntu), na pasta do repo:
#   DOMAIN=ws.seudominio.com bash deploy/oracle/setup.sh

if [[ -z "${DOMAIN:-}" ]]; then
  echo "Defina DOMAIN (ex: DOMAIN=arena.seudominio.com bash deploy/oracle/setup.sh)"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

cd "$(dirname "$0")"
echo "DOMAIN=$DOMAIN" > .env
sudo docker compose up -d --build
sudo docker compose ps
echo
echo "Pronto. Aponte o DNS de $DOMAIN para o IP publico desta VM."
echo "Health: https://$DOMAIN/health"
echo "No Vercel: GAME_SERVER_URL=wss://$DOMAIN"
