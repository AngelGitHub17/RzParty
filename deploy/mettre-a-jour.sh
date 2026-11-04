#!/usr/bin/env bash
# Met RzParty à jour depuis GitHub et redémarre le service. Commande : rzparty-maj
set -euo pipefail
APP_DIR="${RZ_APP_DIR:-$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)}"
# « git pull » va réécrire ce fichier : on s'exécute depuis une copie.
if [ -z "${RZ_MAJ_COPY:-}" ]; then
  copy="$(mktemp /tmp/rzparty-maj.XXXXXX)"
  cp "$(readlink -f "$0")" "$copy"
  RZ_MAJ_COPY="$copy" RZ_APP_DIR="$APP_DIR" exec bash "$copy" "$@"
fi
trap 'rm -f "$RZ_MAJ_COPY"' EXIT
cd "$APP_DIR"
run() { if [ "$(id -u)" = 0 ]; then runuser -u rzparty -- env HOME="$APP_DIR" npm_config_cache=/var/cache/rzparty "$@"; else "$@"; fi; }

echo "==> Récupération des nouveautés…"
before="$(git rev-parse HEAD)"
run git pull --ff-only
after="$(git rev-parse HEAD)"
if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
  [ "$(id -u)" = 0 ] && bash deploy/units.sh
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
if [ "$(id -u)" = 0 ]; then bash deploy/units.sh; fi
systemctl restart rzparty
echo "    RzParty est à jour ($(git log -1 --format='%h %s'))."
