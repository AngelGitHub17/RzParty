#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js n'est pas installé (https://nodejs.org)."; exit 1; }
# Installe ou met à jour les dépendances quand elles ont changé depuis le dernier lancement.
if [ ! -d node_modules ] || ! cmp -s package-lock.json node_modules/.rzparty-lock.json; then
  echo "Installation des dépendances, patiente un instant..."
  npm install --no-audit --no-fund || exit 1
  cp package-lock.json node_modules/.rzparty-lock.json
fi
exec npm start
