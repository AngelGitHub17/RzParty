# Journal des mises à jour

Chaque version commence par « ## numéro — date ». La page de présentation et les serveurs
locaux lisent ce fichier : pense à augmenter la version dans package.json à chaque publication.

## 0.8.0 — 9 novembre 2026
- Le Loto devient le Bingo des copains : choix d'une grille de 16 personnages parmi 6, on coche soi-même le personnage tiré avant la boule suivante, 10 boules Mini-jeu, première ligne de 4 gagnante.
- Nouveau mode Trios : échange tes personnages avec ceux du centre pour aligner 3 tenues de la même couleur (couleurs cachées et joker arc-en-ciel), double trio à 10 points.
- Nouveau mode coopératif Bateau d'équilibre : les mini-jeux donnent des personnages petits ou gros à poser sur les vergues sans faire chavirer le bateau.
- Nouveau mode Paires cachées : memory de personnages en tenue sombre, cœurs, personnages qui changent de place et mini-jeu bonus tous les 3 tours.
- Nouveau mode Test d'amitié : « plutôt ceci ou cela ? » et « qui de nous… ? » en secret, mini-jeux synchro, affinité de chaque duo.

## 0.7.0 — 9 novembre 2026
- Tour du monde refait d'après le mode d'origine : la carte devient un réseau de chemins avec embranchements.
- Déplacement : on retourne une carte face cachée de la rangée commune (1 à 6) et on choisit sa case d'arrivée parmi celles en surbrillance.
- Voyage à thème de 3 destinations, avec la distance jusqu'à chacune toujours affichée ; un nouveau voyage commence quand les trois sont visitées.
- Les cartes de transport (Train, Taxi, Hélico, Avion…) s'achètent en boutique ou s'obtiennent en gare, et remplacent la carte de la rangée.

## 0.6.0 — 9 novembre 2026
- Nouveau mode Tour du monde : une carte du monde en boucle, 12 destinations, des cartes de transport et des photos-souvenirs à acheter.
- Mini-jeu de début de tour (10, 5, 3, 1 pièce et ordre de passage), boutiques, gares, aéroports, ports, petits boulots, surprises et 1 contre tous.
- Prolongations : la première photo achetée termine la partie.

## 0.5.0 — 4 novembre 2026
- Grande Roue refaite comme le mode d'origine : 500 médailles pour chacun et pour la banque, roue de 22 cases, 10 tours.
- Nouvelles cases : +300, −300, ½, Banque +500/+600/+800, Banque ×2/×3, Bataille, 1 contre tous, Duel et Chance (petite roue).
- La roue change trois fois au cours de la partie ; en fin de partie, le dernier choisit le mini-jeu des Batailles.
- Prolongations : la partie se termine sur la première Bataille.
- 2 nouveaux mini-jeux, 30 en tout : Chasse aux perles et Tour de cadeaux.

## 0.4.0 — 4 novembre 2026
- 4 nouveaux mini-jeux, 28 en tout.
- Ressort : la jauge rebondit de plus en plus vite et l'élan grandit ; saute au sommet, mais attendre est risqué.
- Puzzle express : retrouve la moitié droite qui complète l'image, une erreur bloque ta main un instant.
- Course de haies : saute chaque haie au bon moment, une haie renversée te coupe dans ton élan.
- Aiguillages : suis les rails des yeux et règle les 3 aiguillages pour mener le train à la bonne gare.

## 0.3.1 — 4 novembre 2026
- Serveur sur Proxmox : il installe tout seul les nouvelles versions publiées (vérification chaque heure), jamais pendant une partie en cours.
- Les mises à jour de sécurité de Debian et de Node.js s'installent aussi automatiquement dans le conteneur.

## 0.3.0 — 4 novembre 2026
- 4 nouveaux mini-jeux, 24 en tout.
- Zappeur fou : appuie dès que la chaîne demandée apparaît à la télé, une mauvaise chaîne bloque ta télécommande.
- Tirs au but : jauge de puissance et direction, la zone dorée est imparable, 5 tirs face à un gardien imprévisible.
- Alunissage : maintiens le moteur pour freiner et pose ta capsule en douceur sans gaspiller le carburant.
- Ballons volants : éclate les ballons de la couleur demandée, qui change en cours de partie.

## 0.2.0 — 4 novembre 2026
- RzParty se joue en ligne : page de présentation, bouton « Jouer » et téléchargement du serveur pour jouer chez soi.
- Les serveurs installés à la maison préviennent quand une nouvelle version sort ; mettre-a-jour.bat l'installe en gardant les profils.
- Page de l'hôte : nouvelle rubrique « Mise à jour » (installation en un clic sur un serveur installé avec git).
- Hébergement sur Proxmox : conteneur LXC créé en une commande, service qui démarre tout seul, configuration NGINX fournie.
- Nouveau mode Loto des copains : cartons de personnages, boule Mini-jeu, première ligne complète gagnante.
- Nouveau mode Quiz entre amis : une vedette répond en secret, les autres devinent sa réponse.
- Nouveau mode Bombe à mots : un mot de la catégorie pour passer la bombe, écrit ou dit à voix haute.
- 4 mini-jeux de timing : Grand tremplin, Liane folle, Pas comptés, Photo souvenir.

## 0.1.0 — octobre 2026
- Mode Survie : une suite de mini-jeux, avec vies ou score à atteindre.
- Mode Plateau : dés spéciaux, boutique, objets, embranchements, cases duel, ovni et événements, plateau personnalisé jusqu'à 2000 cases.
- Mode Grande Roue : médailles, banqueroute et cagnotte en jeu dans les mini-jeux.
- Équipes, bots aux caractères différents, profils et avatars personnalisables, records.
- 16 mini-jeux : réflexes, calcul, mémoire, piratage, labyrinthe, bombe, taupes, couleurs, coup d'œil, tri, escalier secret, chrono, va-et-vient, bandits, paires et visages.
- Écran commun avec téléphones en manettes, ou chacun son écran.
