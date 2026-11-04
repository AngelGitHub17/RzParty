#!/usr/bin/env bash
# Installe RzParty comme service (Debian / Ubuntu, en root) à partir du dossier /opt/rzparty.
# Variables facultatives :
#   RZ_PORT          port du jeu (5555 par défaut)
#   RZ_PUBLIC_URL    adresse publique, ex. https://rzparty.fr (QR code, liens, page de présentation)
#   RZ_CADDY_DOMAIN  installe Caddy dans le conteneur pour ce domaine (HTTPS automatique sur 80/443)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RZ_PORT="${RZ_PORT:-5555}"
RZ_PUBLIC_URL="${RZ_PUBLIC_URL:-}"
RZ_CADDY_DOMAIN="${RZ_CADDY_DOMAIN:-}"
[ -z "$RZ_PUBLIC_URL" ] && [ -n "$RZ_CADDY_DOMAIN" ] && RZ_PUBLIC_URL="https://${RZ_CADDY_DOMAIN}"

[ "$(id -u)" = 0 ] || { echo "Lance ce script en root."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> Paquets système…"
apt-get update -qq
apt-get install -y -qq curl ca-certificates git gnupg >/dev/null

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  echo "==> Installation de Node.js 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    Node $(node -v), npm $(npm -v)"

echo "==> Utilisateur de service…"
id rzparty >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin rzparty
chown -R rzparty:rzparty "$APP_DIR"
git config --global --add safe.directory "$APP_DIR"

echo "==> Dépendances et compilation du client (une à deux minutes)…"
cd "$APP_DIR"
mkdir -p /var/cache/rzparty && chown rzparty:rzparty /var/cache/rzparty
sudo_rz() { runuser -u rzparty -- env HOME="$APP_DIR" npm_config_cache=/var/cache/rzparty "$@"; }
sudo_rz npm ci --no-audit --no-fund
sudo_rz npm run build

echo "==> Configuration…"
TRUST=0
[ -n "$RZ_CADDY_DOMAIN$RZ_PUBLIC_URL" ] && TRUST=1
mkdir -p /etc/rzparty
if [ ! -f /etc/rzparty/rzparty.env ]; then
  cat > /etc/rzparty/rzparty.env <<CONF
# Réglages de RzParty. Après modification : systemctl restart rzparty
RZ_PORT=${RZ_PORT}
RZ_HOST=0.0.0.0
RZ_NO_OPEN=1
# Adresse publique (QR code, liens d'invitation). Laisser vide pour le réseau local seul.
RZ_PUBLIC_URL=${RZ_PUBLIC_URL}
# 1 = serveur en ligne : page de présentation sur « / », téléchargement du jeu, journal des versions.
RZ_SITE=${TRUST}
# 1 si un proxy (Caddy, Nginx Proxy Manager) est devant le jeu.
RZ_TRUST_PROXY=${TRUST}
# Page /hote : « lan » = depuis le réseau local (jamais Internet), « local » = depuis le conteneur seul.
RZ_ADMIN_FROM=lan
CONF
fi

install -m 0644 "$APP_DIR/deploy/rzparty.service" /etc/systemd/system/rzparty.service
sed -i "s|/opt/rzparty|${APP_DIR}|g" /etc/systemd/system/rzparty.service
ln -sf "$APP_DIR/deploy/mettre-a-jour.sh" /usr/local/bin/rzparty-maj
chmod +x "$APP_DIR"/deploy/*.sh "$APP_DIR"/deploy/proxmox/*.sh
systemctl daemon-reload
systemctl enable --now rzparty >/dev/null
systemctl restart rzparty

if [ -n "$RZ_CADDY_DOMAIN" ]; then
  echo "==> Caddy pour ${RZ_CADDY_DOMAIN}…"
  if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
  sed -e "s|rzparty.fr|${RZ_CADDY_DOMAIN}|g" -e "s|localhost:5555|localhost:${RZ_PORT}|g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
fi

sleep 2
if systemctl is-active --quiet rzparty; then
  echo ""
  echo "  RzParty tourne : http://$(hostname -I | awk '{print $1}'):${RZ_PORT}"
  [ -n "$RZ_PUBLIC_URL" ] && echo "  Adresse publique : ${RZ_PUBLIC_URL}"
  echo "  Journal : journalctl -u rzparty -f      Mise à jour : rzparty-maj"
else
  echo "  Le service n'a pas démarré. Regarde : journalctl -u rzparty -n 50"
  exit 1
fi
