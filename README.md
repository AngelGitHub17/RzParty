# RzParty

Party game multijoueur jouable dans le navigateur, servi par un PC du réseau local.
Inspiré de l'esprit des jeux de société vidéo, avec un univers entièrement original.

## Lancer une partie

**Windows** : double-clique sur `start.bat`.
**Linux / macOS** : `./start.sh`.
**Ou** dans un terminal : `npm install` (une seule fois), puis `npm start`.

Il faut [Node.js](https://nodejs.org) 20 ou plus récent sur le PC hôte. Rien à installer sur les autres appareils.

Au démarrage, la console affiche deux adresses :

- `http://localhost:5555` sur le PC hôte ;
- `http://<ip-du-pc>:5555` pour les autres appareils du même Wi-Fi.

### Changer de port

Par défaut, RzParty utilise le port **5555**. Pour en changer, appuie sur **Ctrl+P** dans la fenêtre
du serveur et tape le nouveau port (par exemple 8080). Il est enregistré dans `rzparty.config.json`
et réutilisé aux lancements suivants. Si le port est déjà pris au démarrage, la console propose
d'en choisir un autre.

| Raccourci | Action |
| --- | --- |
| Ctrl+P | Changer de port (les salons en cours sont fermés) |
| Ctrl+O | Ouvrir le jeu dans le navigateur |
| Ctrl+C | Arrêter le serveur |

Au premier lancement, Windows peut demander d'autoriser Node.js sur les **réseaux privés** : accepte, sinon les téléphones ne pourront pas se connecter.

### Deux façons de jouer

| Page | Usage |
| --- | --- |
| `/ecran` | La télé ou le PC du salon affiche la partie, un QR code et le code du salon. |
| `/manette` | Le téléphone de chaque joueur sert de manette (ouvert en scannant le QR code). |
| `/jouer` | Chaque joueur voit la partie sur son propre ordinateur. Permet de créer un salon. |

Le premier joueur arrivé devient le chef : il ajoute des bots, règle la partie et la lance.

### Profils et avatars

En rejoignant une partie, chaque joueur touche son personnage dans la liste des profils du PC hôte,
ou crée le sien : pseudo, avatar (couleurs, silhouette, visage, chapeau, accessoire, avec un aperçu
3D) et un **code PIN facultatif** à 4 chiffres. L'appareil se souvient du dernier profil utilisé.
On peut aussi jouer en invité, sans profil (aucune statistique n'est gardée).

Les statistiques (parties, victoires, manches, records des mini-jeux) sont enregistrées dans
`data/profiles.json`. Chaque fiche est signée avec une clé propre au PC (`data/secret.key`) : un
profil modifié à la main est détecté au démarrage et ses statistiques sont effacées
(« Bien essayé, sauvegarde effacée »).

Pour garder les profils discrets, la liste complète n'est jamais affichée : chacun tape son pseudo
(les profils déjà utilisés sur un appareil y restent proposés).

La page **`/hote`** (sur le PC hôte uniquement, protégée par un identifiant et un mot de passe créés
au premier accès) permet de renommer, retirer un PIN oublié,
remettre les statistiques à zéro ou supprimer un profil. Mot de passe oublié : supprime
`data/admin.json` et recrée le compte. Pense à sauvegarder le dossier `data/` si tu réinstalles RzParty.

### Mode Plateau

La course vers l'arrivée, sur un plateau 3D généré au hasard à chaque partie. Le chef choisit sa
longueur : Court (30 cases), Moyen (45), Long (60), Très long (80), Marathon (100) ou **Personnalisé** :
jusqu'à 2000 cases, proportion de chaque type de case (ex. que des cases rouges), nombre
d'embranchements, avance/recul des cases bleues et rouges, pièces au départ, multiplicateur de pièces,
nombre d'objets portables, mini-jeu tous les N tours, limite de tours (le plus proche de l'arrivée
gagne), dés bonus, doubles et variété des cases.

1. Un premier mini-jeu décide de l'ordre de jeu.
2. Chaque tour commence par l'annonce « Tour X ». Chacun à son tour lance le dé (un vrai dé 3D
   au-dessus de son pion) et avance. À un embranchement, on choisit entre le chemin principal et un
   détour risqué, plus long mais plein de surprises.
3. Cases : **bleue** +4 cases, **rouge** −4 cases, **violette** on passe son prochain tour.
   Pas d'enchaînement : la case où l'on arrive après un bonus ou un malus ne s'active pas.
4. Quand tout le monde a joué, un mini-jeu rapporte des pièces (20 au 1er, 10 au 2e, 5 au 3e,
   1 au dernier, 3 pour les places intermédiaires) et **son classement devient le nouvel ordre de passage**.
5. Plateaux Long, Très long et Marathon : ce mini-jeu donne aussi un dé bonus, ajouté au prochain
   lancer : dé d'or (6 faces) pour le 1er, d'argent (4) pour le 2e, de fer (3) pour le 3e, rien pour le dernier.
6. Double : si les deux dés (dé normal + dé bonus) font le même chiffre, un 3e dé est lancé.
7. **Boutiques** (cases roses « $ ») : en passant dessus ou en s'y arrêtant, on peut acheter des
   objets. On en porte 2 au maximum, ils sont secrets (seul leur nombre est visible) et on en utilise
   un par tour, avant de lancer le dé :
   - **Dé pipé** (12 pièces) : tu choisis le résultat de ton dé, de 1 à 6 ;
   - **Dé à 12 faces** (8 pièces) : ton dé normal devient un dé à 12 faces pour ce lancer ;
   - **Aimant à pièces** (10 pièces) : 3 chances sur 4 de voler 3 à 10 pièces à chaque adversaire,
     sinon retour de flamme (tu perds 1 à 5 pièces, partagées entre les autres) ;
   - **Brouilleur** (6 pièces) : pièces, places et cases restantes de tous sont cachées pendant 2 tours.
8. **Duel** (case verte « V ») : tu choisis un adversaire, un mini-jeu à deux vous départage, le
   gagnant prend la mise (10 pièces par défaut) au perdant.
9. **OVNI** (case turquoise « U ») : effet au hasard (emporté en avant ou en arrière, échange de
   place avec un joueur, pièces offertes ou aspirées).
10. **Événement** (case orange « ? ») : touche tout le monde (pluie de pièces, tremblement de terre,
    vent arrière, redistribution des pièces, impôt solidaire).
11. **Équipes** (2, 3 ou 4, tirées au hasard au lancement) : les coéquipiers partagent leurs pièces,
    les mini-jeux sont classés par équipe (place moyenne des membres), les duels opposent toujours deux
    équipes différentes, et toute l'équipe gagne dès qu'un de ses membres arrive.
12. Le premier arrivé gagne.

### Mode Grande Roue

Chacun à son tour fait tourner la roue (3, 5 ou 8 tours) : médailles à gagner, ×2, vol au
premier, perte et **banqueroute** (les médailles perdues remplissent la cagnotte). Une case
« Mini-jeu » lance un mini-jeu pour tous : le gagnant rafle la cagnotte. À la fin, le plus riche
en médailles gagne.

### Loto des copains

Chacun reçoit un carton de 24 personnages (la case du milieu est offerte). Les boules tombent et
cochent les cartons toutes seules ; une boule « Mini-jeu » lance un mini-jeu dont le gagnant coche
la case de son choix. Première ligne complète (rangée, colonne ou diagonale) : gagné !

### Quiz entre amis

À tour de rôle, un joueur est la vedette : il répond en secret à une question sur lui (plat
préféré, vacances…). Les autres parient sur sa réponse. +1 par bon pari, et la vedette gagne 1 point
par ami qui l'a bien devinée. 5, 8 ou 12 questions.

### Bombe à mots

Une catégorie s'affiche (fruits, pays, métiers…). Pour passer la bombe, son porteur écrit un mot de
la catégorie ou le dit à voix haute ; les autres peuvent le refuser à la majorité. Celui qui tient la
bombe quand elle explose prend un BOUM. Après 3, 5 ou 8 bombes, le moins de BOUM gagne.

### Mini-jeux au choix

Dans le salon, la liste « Mini-jeux » permet au chef de choisir ceux qui seront tirés (ou un seul,
pour enchaîner le même jeu). Valable dans tous les modes.

### Mode Survie

Une suite de mini-jeux sans plateau. Avant chaque manche, les règles s'affichent et chacun appuie
sur « Je suis prêt ».

- **Vies** (3, 5 ou 7) : le ou les derniers de chaque manche perdent une vie. Le dernier survivant gagne.
- **Score** (5, 10 ou 15 points) : 3 points pour le premier, 1 pour le deuxième. Le premier au score gagne.

Mini-jeux disponibles : **Dégaine !** (réflexes), **Calcul express** (calcul mental), **Mémo-flash** (mémoire : couleurs, formes, chiffres ou objet disparu, une variante par niveau), **Piratage** (code secret à deviner avec des indices), **Labyrinthe** (le même labyrinthe pour tous, premier sorti), **Patate explosive** (une bombe à se passer en tapant un mot avant qu'elle n'explose), **Tape-taupe** (les mêmes taupes pour tous, tape-les vite), **Couleurs piégées** (toucher la couleur de l'encre, pas du mot), **Coup d'œil** (compter des formes vues quelques secondes), **Tri éclair** (toucher les nombres dans l'ordre croissant), **Escalier secret** (1, 2 ou 3 marches en secret, même choix = bloqués), **Chrono à l'aveugle** (arrêter un chrono invisible pile au bon temps), **Va-et-vient** (compter qui entre et sort de la maison), **Ruée vers l'Ouest** (bandits oui, habitants non), **Paires de fruits** (memory), **Où est-il ?** (retrouver un personnage parmi ses sosies), **Grand tremplin** (sauter au dernier moment), **Liane folle** (lâcher la liane au bon moment), **Pas comptés** (compter ses pas de tête), **Photo souvenir** (déclencher au plus grand sourire).

Le fichier [docs/catalogue.md](docs/catalogue.md) liste toutes les idées de mini-jeux et de modes
reprises de Wii Party, avec leur nom RzParty, leur adaptation aux boutons et leur état.
Un joueur déconnecté pendant une partie garde sa place ; un bot joue pour lui en attendant son retour.

## Héberger sur un serveur (Proxmox, nom de domaine)

RzParty peut tourner en continu dans un conteneur LXC et être joué depuis Internet (ex. https://rzparty.fr).
Tout est expliqué dans [docs/hebergement.md](docs/hebergement.md) : création du conteneur en une commande,
mise à jour avec `rzparty-maj`, proxy HTTPS (Nginx Proxy Manager ou Caddy).

## Développement

```bash
npm run dev        # serveur (port 5555) + client Vite (port 5173) avec rechargement à chaud
npm test           # tests (Vitest)
npm run typecheck  # vérification TypeScript de tous les paquets
```

En développement, ouvre `http://localhost:5173`. Les téléphones utilisent `http://<ip-du-pc>:5173`.

Pour tester un mini-jeu précis, limite le tirage avec `RZ_MINIGAMES` :

```bash
set RZ_MINIGAMES=reflexes&& npm start        # Windows (cmd)
RZ_MINIGAMES=reflexes,calcul npm start        # Linux / macOS
```

Pour tester la boutique sans attendre, `RZ_START_COINS=40` donne 40 pièces à chacun au départ
(Windows : `set RZ_START_COINS=40&& npm start`).

## Organisation

```text
RzParty/
├─ packages/
│  ├─ shared/      types, protocole réseau, réglages, validation — utilisés partout
│  ├─ server/      Fastify + Socket.IO : salons, chef, bots, reconnexion, modes de jeu
│  ├─ client/      Vite : accueil, /ecran, /manette, /jouer, /hote, avatars 2D et 3D (Three.js)
│  └─ minigames/   un dossier par mini-jeu (contrat dans src/contract.ts)
├─ data/          profils des joueurs (créé au premier lancement, à sauvegarder)
├─ start.bat / start.sh
└─ README.md
```

Principe : **le serveur a toujours raison**. Le navigateur envoie des intentions, le serveur
valide, calcule, puis diffuse l'état du salon à tout le monde.

### Ajouter du contenu

- **Un mini-jeu** : voir `packages/minigames/README.md`.
- **Un mode de jeu** : l'enregistrer avec `registerMode()` dans `packages/server/src/modes/`.
  Un mode non enregistré apparaît « bientôt » dans le salon et ne peut pas être lancé.
- **Une personnalité de bot** : l'ajouter à `BOT_PERSONALITIES` dans `packages/shared/src/catalog.ts`.

## Avancement

| Phase | Contenu | État |
| --- | --- | --- |
| 0 | Socle : serveur, salons, chef, QR code, bots, reconnexion | Fait |
| 1 | Mini-jeux et mode Survie | Fait |
| 2 | Profils et avatars | Fait |
| 3 | Plateau 3D | Fait |
| 4 | Économie : pièces, boutique, objets | Fait |
| 5 | Duels, équipes, OVNI, événements | Fait |
| 6 | Contenu : mini-jeux (13 à ce jour), bots avancés | En cours |
| 7 | Finition : sons, animations, lanceur | À venir |
