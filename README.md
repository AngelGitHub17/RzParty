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

### Mettre à jour

Quand une nouvelle version est publiée sur [rzparty.fr](https://rzparty.fr/#mises-a-jour), la console
et la page d'accueil le signalent. Ferme RzParty, puis double-clique sur `mettre-a-jour.bat`
(Linux / macOS : `./mettre-a-jour.sh`). Les profils (`data/`) et le port enregistré sont conservés.
Si le dossier a été récupéré avec git, la mise à jour peut aussi se faire depuis la page `/hote`.
Pour ne pas vérifier les mises à jour : variable `RZ_UPDATE_URL=off`.

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
5. Ce mini-jeu donne aussi un dé bonus, ajouté au prochain lancer : dé d'or (1 à 6) pour le 1er,
   d'argent (1 à 3) pour le 2e, de bronze (1 ou 2) pour le 3e, rien pour le dernier.
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
12. **Défi final** : arrivé au sommet, il faut encore gagner un mini-jeu seul contre tous (faire
    mieux que la place moyenne des autres, ou battre son adversaire à deux). Raté : on redescend de
    6 cases et la course continue. Le premier qui réussit son défi gagne (désactivable en Personnalisé).

### Mode Grande Roue

Fidèle au principe du mode « Spin-Off » : tout le monde **et la banque** part avec 500 médailles.
Chacun lance la roue à son tour, pendant 10 tours (5 ou 15 au choix). La roue a 22 cases :

- **+300** (payées par la banque), **−300** et **½** (la moitié de tes médailles part à la banque) ;
- **Banque +500 / +600 / +800**, **Banque ×2 / ×3** : la banque grossit ;
- **Bataille** : mini-jeu à tous, le gagnant rafle la banque (partagée en cas d'égalité, rien si tout le monde est à égalité) ;
- **1 contre tous** : le lanceur seul contre les autres ; s'il fait mieux que la place moyenne de l'équipe il prend la banque, sinon l'équipe se la partage ;
- **Duel** : le lanceur choisit un adversaire ; s'il gagne le mini-jeu, il lui prend la moitié de ses médailles ;
- **Chance** : une petite roue donne rien, la moitié ou toute la banque.

La roue **change trois fois** : au début beaucoup de cases Banque, puis arrivent ½, Chance, Duel
et 1 contre tous, et en fin de partie le dernier au classement choisit le mini-jeu des Batailles
parmi trois. Après le dernier tour viennent les **prolongations** : la partie se termine après la
première Bataille (jouée d'office au bout de 10 tours de prolongation). Le plus riche gagne.

### Tour du monde

Tout le monde part de Paris avec 10 pièces. Chaque tour commence par un mini-jeu qui rapporte
10, 5, 3 ou 1 pièce et fixe l'ordre de passage. La carte est un **réseau de chemins avec
embranchements**. À son tour, on retourne une des **5 cartes face cachée** de la rangée commune
(de 1 à 6) et on **choisit sa case d'arrivée** parmi celles à exactement ce nombre de cases, ou on
joue une carte de transport achetée (Train 4-6, Taxi 1 à 3, Hélico 8, Montgolfière 3 à 8, Avion vers
un aéroport, Super voyage vers une destination). Un **voyage à thème** propose 3 destinations :
y passer avec 10 pièces rapporte leur photo-souvenir ; la distance jusqu'à chacune est toujours
affichée, et un nouveau voyage commence quand les trois sont visitées. En route : boutiques, gares,
aéroports et ports (5 pièces), petits boulots, surprises et 1 contre tous. Après les tours prévus
(6, 10 ou 15), la première photo des prolongations termine la partie.

### Bingo des copains

Chacun choisit une grille de 16 personnages parmi 6 (une grille prise ne peut plus l'être). La
machine contient les 24 personnages et 10 boules « Mini-jeu ». Quand un personnage sort, ceux qui
l'ont doivent **le toucher eux-mêmes** sur leur grille avant la boule suivante, sinon c'est trop tard.
Une boule « Mini-jeu » lance un mini-jeu dont le gagnant coche la case de son choix. Première ligne
de 4 (rangée, colonne ou diagonale) : bingo !

### Trios

Chacun a 6 personnages en 2 rangées de 3. À chaque tour (4, 6 ou 8), un mini-jeu fixe l'ordre de
passage ; dans cet ordre, chacun prend un personnage au centre et le met à la place d'un des siens
(ou passe). Certains cachent la couleur de leur tenue jusqu'à ce qu'on les prenne, et
l'arc-en-ciel va avec toutes les couleurs. À la fin du tour, une rangée de 3 de la même couleur
rapporte 3 points, les deux rangées d'un coup 10 points ; elles laissent alors la place à de
nouveaux personnages. Le plus de points gagne.

### Bateau d'équilibre

Mode coopératif : tout le salon forme l'équipage. Chaque mini-jeu donne à chacun un personnage à
embarquer : petit pour le premier, gros pour le dernier. On le pose sur la vergue de sa couleur, à
gauche ou à droite du mât : plus il est lourd, loin du mât et haut, plus le bateau penche (les places
dangereuses sont signalées en rouge). Un coup de vent souffle entre deux tours. Embarquez 15 ou 20
personnages sans chavirer pour gagner tous ensemble.

### Paires cachées

24 personnages en tenue sombre, 2 de chaque couleur. À son tour, on en retourne deux : même couleur,
c'est une paire et on rejoue ; sinon on perd son cœur et la main passe. De temps en temps, deux
personnages changent de place (signalés par ↔). Tous les 3 tours, un mini-jeu donne un cœur bonus au
gagnant pour son prochain tour. Le plus de paires gagne (6, 10 ou 14 tours).

### Test d'amitié

Des « Plutôt chat ou chien ? » et des « Qui de nous est le plus gourmand ? » auxquels chacun répond
en secret. Deux joueurs qui répondent pareil rapprochent leur duo. Après la dernière question, un mini-jeu
final « synchro » rapproche ceux qui finissent près l'un de l'autre au classement (il compte comme
3 questions). Enfin, le **taux d'amitié** de chaque duo, de 0 à 100, est révélé : le duo le plus
complice gagne. 8, 12 ou 16 questions.

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

Mini-jeux disponibles : **Dégaine !** (réflexes), **Calcul express** (calcul mental), **Mémo-flash** (mémoire : couleurs, formes, chiffres ou objet disparu, une variante par niveau), **Piratage** (code secret à deviner avec des indices), **Labyrinthe** (le même labyrinthe pour tous, premier sorti), **Patate explosive** (une bombe à se passer en tapant un mot avant qu'elle n'explose), **Tape-taupe** (les mêmes taupes pour tous, tape-les vite), **Couleurs piégées** (toucher la couleur de l'encre, pas du mot), **Coup d'œil** (compter des formes vues quelques secondes), **Tri éclair** (toucher les nombres dans l'ordre croissant), **Escalier secret** (1, 2 ou 3 marches en secret, même choix = bloqués), **Chrono à l'aveugle** (arrêter un chrono invisible pile au bon temps), **Va-et-vient** (compter qui entre et sort de la maison), **Ruée vers l'Ouest** (bandits oui, habitants non), **Paires de fruits** (memory), **Où est-il ?** (retrouver un personnage parmi ses sosies), **Grand tremplin** (sauter au dernier moment), **Liane folle** (lâcher la liane au bon moment), **Pas comptés** (compter ses pas de tête), **Photo souvenir** (déclencher au plus grand sourire), **Zappeur fou** (appuyer sur la bonne chaîne), **Tirs au but** (jauge de puissance et direction), **Alunissage** (freiner pour se poser en douceur), **Ballons volants** (éclater la bonne couleur), **Ressort** (sauter au sommet, l'élan grandit), **Puzzle express** (compléter l'image), **Course de haies** (sauter au bon moment), **Aiguillages** (mener le train à la bonne gare), **Chasse aux perles** (attraper la perle avant que l'huître se referme), **Tour de cadeaux** (empiler les cadeaux au millimètre).

Le fichier [docs/catalogue.md](docs/catalogue.md) liste toutes les idées de mini-jeux et de modes
reprises de Wii Party, avec leur nom RzParty, leur adaptation aux boutons et leur état.
Un joueur déconnecté pendant une partie garde sa place ; un bot joue pour lui en attendant son retour.

## Héberger sur un serveur (Proxmox, nom de domaine)

RzParty peut tourner en continu dans un conteneur LXC et être joué depuis Internet (ex. https://rzparty.fr).
En mode site (`RZ_SITE=1`), `/` affiche la page de présentation (modes, mini-jeux, téléchargement,
journal des versions) et le jeu est sur `/accueil`. Tout est expliqué dans [docs/hebergement.md](docs/hebergement.md) :
création du conteneur en une commande, configuration NGINX, mise à jour depuis `/hote` ou avec `rzparty-maj`.

### Publier une nouvelle version

1. Augmente `version` dans `package.json`.
2. Ajoute en haut de `CHANGELOG.md` une section `## x.y.z — date` avec une ligne par nouveauté.
3. Envoie sur GitHub, puis mets le serveur en ligne à jour (page `/hote` ou `rzparty-maj`).
   Les serveurs installés chez les joueurs le signalent ensuite tout seuls.

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
