#!/usr/bin/env bash
# Crée un conteneur LXC Debian pour RzParty sur Proxmox, puis y installe le jeu.
# À lancer sur l'hôte Proxmox (en root), par exemple :
#   RZ_GIT_TOKEN=ghp_xxx bash creer-lxc.sh
# Variables facultatives : CTID, CT_HOSTNAME, CT_STORAGE, CT_BRIDGE, CT_IP (ex. 192.168.1.50/24),
# CT_GW, CT_MEMORY, CT_CORES, CT_DISK, RZ_REPO, RZ_BRANCH, RZ_PUBLIC_URL, RZ_CADDY_DOMAIN.
set -euo pipefail

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-rzparty}"
CT_STORAGE="${CT_STORAGE:-local-lvm}"
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"
CT_IP="${CT_IP:-dhcp}"
CT_GW="${CT_GW:-}"
CT_MEMORY="${CT_MEMORY:-1024}"
CT_CORES="${CT_CORES:-2}"
CT_DISK="${CT_DISK:-8}"
RZ_REPO="${RZ_REPO:-https://github.com/AngelGitHub17/rzparty.git}"
RZ_BRANCH="${RZ_BRANCH:-main}"

command -v pct >/dev/null || { echo "Ce script se lance sur l'hôte Proxmox (commande pct introuvable)."; exit 1; }

echo "==> Recherche du modèle Debian 12…"
pveam update >/dev/null
TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep -E '^debian-12-standard' | sort -V | tail -n1)"
[ -n "$TEMPLATE" ] || { echo "Modèle Debian 12 introuvable."; exit 1; }
if ! pveam list local | grep -q "$TEMPLATE"; then
  echo "==> Téléchargement de $TEMPLATE…"
  pveam download local "$TEMPLATE"
fi

NET="name=eth0,bridge=${CT_BRIDGE},ip=${CT_IP}"
[ -n "$CT_GW" ] && NET="${NET},gw=${CT_GW}"

echo "==> Création du conteneur $CTID ($CT_HOSTNAME)…"
pct create "$CTID" "local:vztmpl/${TEMPLATE}" \
  --hostname "$CT_HOSTNAME" --cores "$CT_CORES" --memory "$CT_MEMORY" --swap 512 \
  --rootfs "${CT_STORAGE}:${CT_DISK}" --net0 "$NET" \
  --unprivileged 1 --features nesting=1 --onboot 1 --ostype debian
pct start "$CTID"

echo "==> Attente du réseau…"
for _ in $(seq 1 30); do
  pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
  sleep 2
done

echo "==> Récupération de RzParty dans le conteneur…"
pct exec "$CTID" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git ca-certificates curl >/dev/null"
CLONE_URL="$RZ_REPO"
if [ -n "${RZ_GIT_TOKEN:-}" ]; then CLONE_URL="${RZ_REPO/https:\/\//https://x-access-token:${RZ_GIT_TOKEN}@}"; fi
pct exec "$CTID" -- git clone --branch "$RZ_BRANCH" "$CLONE_URL" /opt/rzparty

pct exec "$CTID" -- env RZ_PUBLIC_URL="${RZ_PUBLIC_URL:-}" RZ_CADDY_DOMAIN="${RZ_CADDY_DOMAIN:-}" bash /opt/rzparty/deploy/installer.sh

IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"
echo ""
echo "  Conteneur $CTID prêt. RzParty répond sur http://${IP}:5555"
echo "  Mise à jour plus tard : pct exec $CTID -- rzparty-maj"
