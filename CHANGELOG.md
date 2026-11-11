# Journal des mises à jour

Chaque version commence par « ## numéro — date ». La page de présentation et les serveurs
locaux lisent ce fichier : pense à augmenter la version dans package.json à chaque publication.

## 0.12.1 — 11 novembre 2026
- Page de présentation : les installeurs s'affichent même quand le serveur n'arrive pas à joindre GitHub (refus, limite de demandes, pare-feu) : la page les cherche alors elle-même depuis le navigateur.
- Si la version du serveur n'a pas encore d'installeurs, ceux de la dernière version publiée sont proposés (ils se mettent ensuite à jour tout seuls).
- Lien vers toutes les versions publiées sur GitHub quand aucun installeur n'est trouvé ; message dans le journal du serveur si GitHub ne répond pas ; jeton facultatif `RZ_GITHUB_TOKEN`.

## 0.12.0 — 10 novembre 2026
- Passage en 3D, deuxième étape : Bingo des copains (machine à boules qui tourne, boule tirée qui roule avec le personnage dedans, derniers tirés sur leurs socles, BINGO sous les confettis).
- Trios en 3D : table ronde des personnages du centre et estrade de chaque joueur ; on touche directement un personnage du centre puis celui à remplacer ; trios marqués sous les confettis.
- Paires cachées en 3D : 24 personnages sur une place pavée, à toucher pour les révéler ; les paires prennent la couleur du joueur, ceux qui bougent sautent.
- Test d'amitié en 3D : un tapis par réponse ; à la révélation, chacun rejoint le sien et les réponses communes s'illuminent de cœurs.
- Quiz entre amis en 3D : plateau télé, vedette sous le projecteur, pupitres, et chacun rejoint le panneau de son pari à la révélation.
- Bombe à mots en 3D : cercle autour du feu de camp, bombe qui passe de main en main et crépite de plus en plus vite, BOUM !
- Pseudos vérifiés : 2 à 16 caractères avec une lettre, pas d'insulte, de grossièreté, de lien, de numéro ni de nom réservé (hôte, admin…). Le problème s'affiche pendant la frappe, avec les règles ; un profil dont le pseudo ne respecte pas les règles doit être renommé avant de jouer (signalé aussi sur /hote).
- Page /hote ouverte par défaut à tout le réseau local du serveur (pratique sur un conteneur LXC sans écran), y compris les appareils en IPv6 donnés par la box ; jamais depuis Internet. RZ_ADMIN_FROM=local la réserve à la machine du serveur.
- Page de présentation : nouvelles images de ces six modes.

## 0.11.1 — 10 novembre 2026
- Île aux défis : à chaque défi (sauf la cascade), on relance un seul dé avec le bouton « Lancer le dé du défi ». Mur du dragon raté : le feu fait reculer de 3 cases.
- Île aux défis : défi final tenté dès l'arrivée au sommet (un 6 au dé) ; sinon, aux tours suivants, 6 ou plus avec ses dés, dé bonus compris.
- Île aux défis : l'éruption ne dure que jusqu'à la fin du tour, et les éruptions se cumulent (−4, −8, −12…).
- Île aux défis : en sortant du volcan, on revient à la case d'où l'on est tombé (plus de saut plus loin sur l'île).
- Île aux défis en 3D : île plus grande, cases espacées et posées sur des piliers (plus dans la montagne), caméra plus proche du joueur, dés bonus qui roulent et affichent leur résultat.
- Île aux défis : bien plus d'animations (palmiers, nuages, oiseaux, fumée et lave du volcan, défis animés, poussière à chaque saut, « +N / −N » qui s'envolent, boule à pointes qui dévale, confettis au sommet).
- Mini-jeux : barres de score qui glissent, scores qui sautent, confettis sur le gagnant de chaque manche et sur le podium.
- Alunissage simplifié : chute plus courte et plus lente, plus de carburant, jauge de vitesse verte/rouge avec « Freine ! ».
- Chrono à l'aveugle plus clair : objectif affiché en grand, explications pas à pas, temps plus courts (3 à 7,5 s), barre de progression, « trop tôt / trop tard » au résultat.
- Page de présentation : nouvelles images des modes en 3D (Île aux défis, Grande Roue, Bateau, Tour du monde) et des mini-jeux Alunissage et Chrono à l'aveugle.

## 0.11.0 — 10 novembre 2026
- Passage en 3D, première étape : l'Île aux défis devient une vraie île en pente, avec son chemin en spirale, ses six défis, le volcan qui gronde, les dés qui roulent au-dessus du joueur et la caméra qui le suit.
- Grande Roue en 3D : une roue de jeu télévisé sur une scène, avec ses picots, son clapet, la banque en pile de médailles et les joueurs alignés devant.
- Bateau d'équilibre en 3D : un voilier qui penche vraiment sur la mer ; on pose son personnage en touchant une place sur la vergue (rouge = risqué).
- Tour du monde en 3D : un globe qui tourne vers le joueur dont c'est le tour ; les cases possibles se touchent directement sur le globe.
- Les dés bonus du plateau ont enfin leur bonne couleur : or (1 à 6), argent (1 à 3), bronze (1 ou 2).
- Sans WebGL, ces modes restent jouables avec l'affichage 2D d'avant.
- Installeur Windows : correction de la construction du .msi.

## 0.10.1 — 10 novembre 2026
- Installeurs Windows (.msi), Linux (.deb) et Mac (.pkg) avec Node.js inclus, proposés sur la page de présentation à côté du .zip.
- La version installée se met à jour toute seule entre deux parties, puis se relance (profils conservés).
- La page /hote peut aussi installer la mise à jour d'un dossier .zip, sans passer par mettre-a-jour.bat.

## 0.10.0 — 10 novembre 2026
- Nouveau mode Île aux défis, fidèle au mode d'origine : 72 cases en spirale, dés bonus or/argent/bronze, double = un dé de plus, six défis (liane, mur du dragon, caisses ou tonneaux, volcan ou pas, boule à pointes, défi final à 6), volcan, éruption, statues, dino, tornade, OVNI, 1 contre tous et duels.
- Test d'amitié : 5 questions par défaut, comme le mode d'origine (ou 10, 15).
- Page de présentation : une capture pour chaque mode et pour chacun des 30 mini-jeux.
- Anciennes versions téléchargeables sur la page de présentation (figées, sans mise à jour automatique) ; la dernière version, qui se met à jour, reste proposée en premier.

## 0.9.0 — 9 novembre 2026
- Plateau plus proche de l'original : dés bonus sur tous les plateaux, or (1 à 6), argent (1 à 3) et bronze (1 ou 2).
- Plateau : défi final au sommet, un mini-jeu seul contre tous à gagner pour remporter la partie, sinon on redescend de 6 cases (désactivable en Personnalisé).
- Test d'amitié : un mini-jeu final de synchro, puis la révélation du taux d'amitié (0 à 100) de chaque duo.
- Salon : le choix du mode s'affiche en grille, plus lisible avec 11 modes.
- Petit écran : le bandeau des joueurs n'affiche plus que les avatars et scores des autres, pour tout voir sans défiler.

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
