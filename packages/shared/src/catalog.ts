import type { BotPersonality, Difficulty, GameModeId } from "./types.ts";

/** Libellés et descriptions affichés dans l'interface. */
export const GAME_MODES: Record<GameModeId, { label: string; description: string }> = {
  survie: {
    label: "Survie",
    description: "Une suite de mini-jeux sans plateau. On perd des vies ou on vise un score.",
  },
  plateau: {
    label: "Plateau",
    description: "La course sur le plateau, avec pièces, boutique et embranchements.",
  },
  loto: {
    label: "Bingo des copains",
    description: "Choisis ta grille de 16 personnages. Quand une boule sort, touche vite le personnage s'il est sur ta grille : à la boule suivante, c'est trop tard ! Les 10 boules Mini-jeu laissent le gagnant cocher la case de son choix. Première ligne de 4 : bingo !",
  },
  quiz: {
    label: "Quiz entre amis",
    description: "À tour de rôle, un joueur répond en secret à une question sur lui. Les autres doivent deviner sa réponse. Qui connaît le mieux ses amis ?",
  },
  mots: {
    label: "Bombe à mots",
    description: "Pour passer la bombe, donne un mot de la catégorie (écrit ou dit à voix haute, validé par les autres). Celui qui la tient quand elle explose prend un BOUM.",
  },
  voyage: {
    label: "Tour du monde",
    description: "Voyage autour de la carte avec des cartes de transport (train, taxi, avion…) et achète les photos-souvenirs des destinations à la une. Pièces au mini-jeu de chaque tour, surprises et 1 contre tous en route. Le plus de photos gagne !",
  },
  ile: {
    label: "Île aux défis",
    description: "Course jusqu'au sommet d'une île : un mini-jeu donne l'ordre et un dé bonus (or, argent, bronze). Six défis barrent la route (liane, mur du dragon, cascade, volcan, boule à pointes) et il faut encore faire 6 au sommet pour gagner. Attention au volcan !",
  },
  trios: {
    label: "Trios",
    description: "Chacun a 6 personnages en 2 rangées. À chaque tour, un mini-jeu fixe l'ordre pour en prendre un au centre (certains cachent leur couleur, l'arc-en-ciel va avec tout). Une rangée de 3 de la même couleur rapporte 3 points, les deux rangées d'un coup 10 !",
  },
  bateau: {
    label: "Bateau d'équilibre",
    description: "Tous dans le même bateau ! Chaque mini-jeu donne à chacun un personnage (petit si on a bien joué, gros sinon) à poser sur la vergue de sa couleur. Embarquez-en assez sans faire chavirer le bateau.",
  },
  paires: {
    label: "Paires cachées",
    description: "24 personnages en tenue sombre : retournes-en deux, même couleur = une paire et tu rejoues. Une erreur coûte ton cœur. Ils bougent de temps en temps, et un mini-jeu tous les 3 tours fait gagner un cœur de plus.",
  },
  amitie: {
    label: "Test d'amitié",
    description: "Des « plutôt ceci ou cela ? » et des « qui de nous… ? » auxquels chacun répond en secret. Plus vos réponses se ressemblent, plus votre duo monte. Un mini-jeu final teste votre synchro, puis le taux d'amitié de chaque duo (de 0 à 100) est révélé !",
  },
  cris: {
    label: "Cris en folie",
    description: "Posez vos téléphones au milieu de la table : chacun pousse le cri d'une bête. Quand une bête s'affiche, attrapez le téléphone qui fait son cri et touchez votre visage dessus ! Une erreur et on attend la manche suivante. Il faut au moins 2 téléphones.",
  },
  cache: {
    label: "Cache-cache",
    description: "Pendant que les autres ferment les yeux, le cacheur cache tous les téléphones dans la pièce. Ensuite, chaque téléphone sonne toutes les 10 secondes : trouvez-les tous avant la fin du temps ! Chacun cache à son tour. Il faut au moins 2 téléphones (sans bots).",
  },
  tictac: {
    label: "Tic-tac-boum",
    description: "La bombe passe de main en main : pour t'en débarrasser, réussis la consigne affichée (coupe le bon fil, appuie le bon nombre de fois…). Une erreur et la mèche raccourcit ! Celui qui la tient quand elle explose prend un BOUM.",
  },
  roue: {
    label: "Grande Roue",
    description: "Joueurs et banque partent avec 500 médailles. La roue donne ou prend des médailles, gonfle la banque, ou lance une Bataille, un 1 contre tous ou un Duel. Elle change trois fois, et les prolongations durent jusqu'à la Bataille finale !",
  },
};

export const BOT_PERSONALITIES: Record<BotPersonality, { label: string; description: string; names: string[] }> = {
  equilibre: {
    label: "Équilibré",
    description: "Joue proprement, sans prendre de risque inutile.",
    names: ["Bilou", "Pompon", "Nestor", "Lulu"],
  },
  agressif: {
    label: "Agressif",
    description: "Rapide et téméraire, quitte à se tromper.",
    names: ["Turbo", "Rafale", "Crocs", "Zigzag"],
  },
  "lent-precis": {
    label: "Lent mais précis",
    description: "Prend son temps et se trompe rarement.",
    names: ["Tortilla", "Prudence", "Hibou", "Pépin"],
  },
  glitch: {
    label: "Glitch",
    description: "Imprévisible : génial ou complètement à côté.",
    names: ["Gl1tch", "Bzzt", "Err0r", "Pixou"],
  },
};

export const DIFFICULTIES: Record<Difficulty, { label: string }> = {
  facile: { label: "Facile" },
  moyen: { label: "Moyen" },
  difficile: { label: "Difficile" },
};

export const SURVIVAL_LIVES_CHOICES = [3, 5, 7] as const;
export const SURVIVAL_SCORE_CHOICES = [5, 10, 15] as const;
