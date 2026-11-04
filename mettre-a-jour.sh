#!/usr/bin/env sh
# Met RzParty à jour (Linux, Mac) : git pull si le dossier vient de GitHub, sinon télécharge la dernière version.
# Les profils (data/) et le port enregistré sont conservés.
set -e
cd "$(dirname "$0")"
URL="${RZ_UPDATE_URL:-https://rzparty.fr}"
if [ -d .git ]; then
  echo "Dossier installé avec git : récupération des nouveautés…"
  exec git pull --ff-only
fi
current="$(node -p "require('./package.json').version")"
latest="$(curl -fsS --max-time 15 "$URL/api/version" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))")"
echo "Version installée : $current — en ligne : $latest"
if [ "$(printf '%s\n%s\n' "$latest" "$current" | sort -V | tail -n1)" = "$current" ]; then
  echo "RzParty est déjà à jour."
  exit 0
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fL --progress-bar "$URL/telecharger" -o "$tmp/RzParty.zip"
(cd "$tmp" && unzip -q RzParty.zip)
[ -f "$tmp/RzParty/package.json" ] || { echo "Archive inattendue."; exit 1; }
# Copie par-dessus l'ancienne version, sans toucher aux profils ni aux réglages.
tar -C "$tmp/RzParty" --exclude=./data --exclude=./rzparty.config.json -cf - . | tar -xf -
echo "RzParty est passé en version $latest. Relance start.sh pour jouer."
