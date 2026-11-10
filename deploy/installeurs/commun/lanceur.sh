#!/bin/sh
# Lanceur des versions installées sous Linux (.deb) et Mac (.pkg).
# L'installeur dépose le jeu dans un dossier système ($1, en lecture seule) ; on le recopie dans le
# dossier de l'utilisateur pour que RzParty puisse s'y mettre à jour tout seul et y garder les profils.
SRC="$1"
case "$(uname -s)" in
  Darwin) OS=darwin; DEST="$HOME/Library/Application Support/RzParty" ;;
  *) OS=linux; DEST="${XDG_DATA_HOME:-$HOME/.local/share}/rzparty" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  *) ARCH=x64 ;;
esac
NODE_DIR="runtime/node-$OS-$ARCH"
if [ ! -x "$SRC/$NODE_DIR/bin/node" ]; then
  echo "Cette version de RzParty ne fonctionne pas sur ce processeur ($OS $ARCH)."
  exit 1
fi

# Première fois, ou installeur plus récent que la copie de l'utilisateur : on (re)copie le jeu.
version() { sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$1/package.json" | head -n 1; }
newer=$("$SRC/$NODE_DIR/bin/node" -e '
  const [a, b] = process.argv.slice(1).map((v) => (v || "0").split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) { console.log((a[i] || 0) > (b[i] || 0) ? 1 : 0); process.exit(0); }
  console.log(0);' "$(version "$SRC")" "$( [ -f "$DEST/package.json" ] && version "$DEST")")
if [ ! -f "$DEST/package.json" ] || [ "$newer" = "1" ]; then
  echo "Préparation de RzParty…"
  mkdir -p "$DEST"
  (cd "$SRC" && tar cf - --exclude=./data --exclude=./rzparty.config.json .) | (cd "$DEST" && tar xf -) || exit 1
fi

cd "$DEST" || exit 1
export PATH="$DEST/$NODE_DIR/bin:$PATH" RZ_LAUNCHER=1 RZ_AUTO_RESTART=1

# Les outils de compilation (pour les mises à jour) dépendent du processeur : on les réinstalle
# une fois si le jeu a été préparé sur un autre type de processeur.
if ! grep -q "\"arch\": *\"$ARCH\"" runtime/installation.json 2>/dev/null && [ ! -f "runtime/.deps-$ARCH" ]; then
  echo "Adaptation à ce processeur ($ARCH), une seule fois…"
  npm ci --no-audit --no-fund && touch "runtime/.deps-$ARCH"
fi

while :; do
  node node_modules/tsx/dist/cli.mjs packages/server/src/index.ts
  code=$?
  # 75 : une mise à jour vient d'être installée, on relance la nouvelle version.
  [ "$code" -eq 75 ] || break
done
if [ "$code" -ne 0 ]; then
  echo
  echo "RzParty s'est arrêté sur une erreur. Lis le message ci-dessus, puis appuie sur Entrée."
  read -r _
fi
exit "$code"
