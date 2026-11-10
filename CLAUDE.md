# RzParty — consignes de travail

- Jeu de société multijoueur (TypeScript, Node, Fastify, Socket.IO, Three.js). Monorepo npm :
  `packages/shared` (types, protocole, réglages), `packages/server`, `packages/client` (Vite : `index.html` = jeu,
  `site.html` = page de présentation), `packages/minigames` (un dossier par mini-jeu + registres `server.ts`, `client.ts`, `catalog.ts`).
- Tous les textes visibles sont en **français**. Univers original : aucun nom ou mention rappelant Wii Party (pas de « Mii »).
- Mini-jeux jouables et équitables au téléphone comme au PC.
- Vérifications avant chaque envoi : `npm run typecheck`, `npm test`, `npm run build`.
- Publication : augmenter `version` dans `package.json` (et les packages) + section en tête de `CHANGELOG.md` (`## x.y.z — date`).
- Ne jamais versionner `data/` ni `rzparty.config.json`.
- Quand un mode de jeu ou un mini-jeu change d'apparence, refaire son image sur la page de présentation
  (`packages/client/public/site/<mode>.webp`, `site/mg/<id>.webp`).
- Hébergement : `deploy/` (LXC Proxmox, service systemd, NGINX, Caddy) et `docs/hebergement.md`.
- Après chaque livraison à l'utilisateur : donner une liste numérotée de fonctionnalités à tester
  (réponse « numéro, OK/KO, commentaire ») et **toujours lui demander son retour**.
