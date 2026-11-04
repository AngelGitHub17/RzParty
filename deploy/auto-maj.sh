#!/usr/bin/env bash
# Mise à jour automatique de RzParty (lancée toutes les heures par rzparty-auto-maj.timer).
# Installe la nouvelle version publiée sur GitHub, mais seulement quand aucune partie n'est en cours.
# Désactivation : RZ_AUTO_UPDATE=0 dans /etc/rzparty/rzparty.env.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$APP_DIR"
[ -f /etc/rzparty/rzparty.env ] && set -a && . /etc/rzparty/rzparty.env && set +a
if [ "${RZ_AUTO_UPDATE:-1}" = "0" ]; then echo "Mise à jour automatique désactivée (RZ_AUTO_UPDATE=0)."; exit 0; fi
PORT="${RZ_PORT:-5555}"
run() { runuser -u rzparty -- env HOME="$APP_DIR" "$@"; }

# Parties en cours ? On réessaiera à la prochaine heure.
busy() {
  local act
  act="$(curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/activite" 2>/dev/null || echo '{}')"
  local games
  games="$(printf '%s' "$act" | sed -n 's/.*"games":\([0-9]*\).*/\1/p')"
  [ -n "$games" ] && [ "$games" -gt 0 ]
}

run git fetch --quiet origin
if [ -n "$(run git log --oneline HEAD..@{u} 2>/dev/null)" ]; then
  if busy; then echo "Nouvelle version disponible, mais une partie est en cours : nouvel essai dans une heure."; exit 0; fi
  echo "Nouvelle version disponible : installation."
  exec "$APP_DIR/deploy/mettre-a-jour.sh"
fi

# Node.js mis à jour par le système depuis le démarrage du jeu ? On relance le jeu quand il est libre.
started="$(systemctl show -p ExecMainStartTimestampMonotonic --value rzparty 2>/dev/null || echo 0)"
node_bin="$(command -v node)"
if [ -n "$node_bin" ] && [[ "$started" =~ ^[0-9]+$ ]] && [ "$started" -gt 0 ]; then
  boot_now="$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)"
  node_age=$(( $(date +%s) - $(stat -c %Y "$(readlink -f "$node_bin")") ))
  service_age=$(( boot_now - started / 1000000 ))
  if [ "$node_age" -lt "$service_age" ] && ! busy; then
    echo "Node.js a été mis à jour : redémarrage du jeu."
    systemctl restart rzparty
    exit 0
  fi
fi
echo "RzParty est à jour ($(git log -1 --format='%h %s'))."
