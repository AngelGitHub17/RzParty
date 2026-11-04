#!/usr/bin/env bash
# Installe (ou réinstalle) les services systemd de RzParty et les mises à jour automatiques.
# Appelé par installer.sh et mettre-a-jour.sh, en root.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
for unit in rzparty.service rzparty-auto-maj.service rzparty-auto-maj.timer; do
  install -m 0644 "$APP_DIR/deploy/$unit" "/etc/systemd/system/$unit"
  sed -i "s|/opt/rzparty|${APP_DIR}|g" "/etc/systemd/system/$unit"
done
ln -sf "$APP_DIR/deploy/mettre-a-jour.sh" /usr/local/bin/rzparty-maj
chmod +x "$APP_DIR"/deploy/*.sh "$APP_DIR"/deploy/proxmox/*.sh 2>/dev/null || true
systemctl daemon-reload
systemctl enable rzparty >/dev/null 2>&1
systemctl enable --now rzparty-auto-maj.timer >/dev/null 2>&1

# Mises à jour de sécurité de Debian (et de Node.js) installées toutes seules.
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null 2>&1 \
    || { echo "    (unattended-upgrades indisponible : mises à jour Debian automatiques non activées)"; exit 0; }
fi
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
cat > /etc/apt/apt.conf.d/52rzparty-upgrades <<'CONF'
// Ajouté par RzParty : mises à jour Debian + Node.js (NodeSource).
Unattended-Upgrade::Origins-Pattern {
        "origin=Debian,codename=${distro_codename},label=Debian";
        "origin=Debian,codename=${distro_codename}-updates";
        "origin=Debian,codename=${distro_codename},label=Debian-Security";
        "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
        "site=deb.nodesource.com";
};
Unattended-Upgrade::Remove-Unused-Dependencies "true";
CONF
