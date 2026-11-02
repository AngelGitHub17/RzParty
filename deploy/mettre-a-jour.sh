#!/usr/bin/env bash
# Met RzParty à jour depuis GitHub et redémarre le service. Commande : rzparty-maj
set -euo pipefail
APP_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$APP_DIR"
run() { if [ "$(id -u)" = 0 ]; then runuser -u rzparty -- "$@"; else "$@"; fi; }

echo "==> Récupération des nouveautés…"
before="$(git rev-parse HEAD)"
run git pull --ff-only
after="$(git rev-parse HEAD)"
if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
  echo "    Déjà à jour ($(git log -1 --format='%h %s'))."
  exit 0
fi
git log --format='    %h %s' "${before}..${after}" | head -20

if ! git diff --quiet "$before" "$after" -- package-lock.json; then
  echo "==> Dépendances…"
  run npm ci --no-audit --no-fund
fi
echo "==> Compilation du client…"
run npm run build
echo "==> Redémarrage…"
if [ "$(id -u)" = 0 ]; then
  install -m 0644 deploy/rzparty.service /etc/systemd/system/rzparty.service
  sed -i "s|/opt/rzparty|${APP_DIR}|g" /etc/systemd/system/rzparty.service
  systemctl daemon-reload
fi
systemctl restart rzparty
echo "    RzParty est à jour ($(git log -1 --format='%h %s'))."
