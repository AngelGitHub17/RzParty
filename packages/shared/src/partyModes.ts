/**
 * Données et états des modes « Bingo des copains », « Quiz entre amis » et « Bombe à mots ».
 */
import type { Avatar } from "./avatar.ts";

// ───────────── Bingo des copains ─────────────

/** Personnages du bingo (tous différents). */
export const LOTO_POOL = 24;
/** Grilles de 4 × 4. */
export const LOTO_SIZE = 4;
export const LOTO_CELLS = LOTO_SIZE * LOTO_SIZE;
/** Grilles proposées au début (au moins une par joueur). */
export const LOTO_GRIDS = 6;
/** Boules « Mini-jeu » dans la machine. */
export const LOTO_MINIGAME_BALLS = 10;

export type LotoBall = { kind: "perso"; index: number } | { kind: "minijeu" };

export interface LotoState {
  /** Les personnages du bingo (générés pour la partie). */
  pool: Avatar[];
  /** Les grilles proposées : 16 numéros de personnage chacune. */
  grids: number[][];
  /** Grille choisie par chaque joueur (null : pas encore choisie). */
  choice: Record<string, number | null>;
  /** Cases cochées (16 par joueur, dans l'ordre de sa grille). */
  marked: Record<string, boolean[]>;
  /** Personnages déjà tirés. */
  drawn: number[];
  /** Boule en cours. */
  ball: LotoBall | null;
  ballId: number;
  /** Personnage qu'on peut encore cocher (le dernier tiré). Ensuite, trop tard ! */
  markable: number | null;
  /** Ce qui reste dans la machine. */
  left: { faces: number; minigames: number };
  phase: "choose" | "draw" | "pick";
  /** Gagnants d'un mini-jeu qui choisissent une case à cocher. */
  pickers: string[];
  endsAt: number | null;
}

/** Les 10 lignes gagnantes : 4 rangées, 4 colonnes, 2 diagonales. */
export const LOTO_LINES: number[][] = [
  ...Array.from({ length: LOTO_SIZE }, (_, r) => Array.from({ length: LOTO_SIZE }, (_, c) => r * LOTO_SIZE + c)),
  ...Array.from({ length: LOTO_SIZE }, (_, c) => Array.from({ length: LOTO_SIZE }, (_, r) => r * LOTO_SIZE + c)),
  Array.from({ length: LOTO_SIZE }, (_, i) => i * (LOTO_SIZE + 1)),
  Array.from({ length: LOTO_SIZE }, (_, i) => (i + 1) * (LOTO_SIZE - 1)),
];

export function hasLine(marked: boolean[]): boolean {
  return LOTO_LINES.some((line) => line.every((i) => marked[i]));
}

/** Nombre de cases manquantes pour la ligne la plus avancée. */
export function lotoMissing(marked: boolean[]): number {
  return Math.min(...LOTO_LINES.map((l) => l.filter((i) => !marked[i]).length));
}

// ───────────── Quiz entre amis ─────────────

export interface QuizQuestion {
  /** {name} est remplacé par le prénom de la vedette. */
  text: string;
  options: [string, string, string, string];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { text: "Quel est le plat préféré de {name} ?", options: ["Pizza", "Raclette", "Sushis", "Pâtes"] },
  { text: "Où {name} partirait-il en vacances ?", options: ["À la mer", "À la montagne", "En ville", "À la campagne"] },
  { text: "Quel animal {name} préfère-t-il ?", options: ["Chien", "Chat", "Lapin", "Poisson rouge"] },
  { text: "Le matin, {name} prend plutôt…", options: ["Un café", "Un thé", "Un chocolat chaud", "Un jus de fruits"] },
  { text: "Quel super-pouvoir {name} choisirait-il ?", options: ["Voler", "Être invisible", "Lire les pensées", "Voyager dans le temps"] },
  { text: "Le week-end idéal de {name} ?", options: ["Dormir", "Faire du sport", "Sortir entre amis", "Jouer aux jeux vidéo"] },
  { text: "Quelle saison {name} préfère-t-il ?", options: ["Printemps", "Été", "Automne", "Hiver"] },
  { text: "Quel dessert {name} choisit-il ?", options: ["Glace", "Gâteau au chocolat", "Tarte aux fruits", "Crêpes"] },
  { text: "Face à une araignée, {name}…", options: ["La laisse vivre", "Crie", "La met dehors", "Appelle quelqu'un"] },
  { text: "Quel genre de film {name} regarde-t-il ?", options: ["Comédie", "Action", "Horreur", "Animation"] },
  { text: "Quelle musique {name} écoute-t-il le plus ?", options: ["Pop", "Rap", "Rock", "Électro"] },
  { text: "Si {name} gagnait au loto, il achèterait d'abord…", options: ["Une maison", "Une voiture", "Un voyage", "Rien, il épargne"] },
  { text: "Quel est le moment préféré de la journée de {name} ?", options: ["Le matin", "Le midi", "Le soir", "La nuit"] },
  { text: "En soirée, {name} est plutôt…", options: ["Le premier à danser", "Au buffet", "En pleine discussion", "Le premier parti"] },
  { text: "Quel sport {name} préfère-t-il ?", options: ["Football", "Natation", "Vélo", "Aucun !"] },
  { text: "Le petit-déjeuner de rêve de {name} ?", options: ["Croissants", "Œufs-bacon", "Céréales", "Rien du tout"] },
  { text: "Quel objet {name} emporterait-il sur une île déserte ?", options: ["Un couteau", "Un livre", "Une console", "Un hamac"] },
  { text: "Comment {name} range-t-il sa chambre ?", options: ["Toujours nickel", "Ça dépend des jours", "Désordre organisé", "Quel rangement ?"] },
  { text: "Quelle couleur {name} préfère-t-il ?", options: ["Bleu", "Rouge", "Vert", "Noir"] },
  { text: "Quel métier {name} aurait-il rêvé de faire ?", options: ["Astronaute", "Cuisinier", "Artiste", "Sportif pro"] },
  { text: "Devant un film triste, {name}…", options: ["Pleure", "Reste de marbre", "Change de chaîne", "S'endort"] },
  { text: "Quel transport {name} préfère-t-il ?", options: ["Voiture", "Train", "Vélo", "Avion"] },
  { text: "Quelle fête {name} préfère-t-il ?", options: ["Noël", "Son anniversaire", "Nouvel An", "Halloween"] },
  { text: "Quel jeu de société {name} choisit-il ?", options: ["Cartes", "Monopoly", "Échecs", "Jeu d'ambiance"] },
  { text: "Au restaurant, {name} commande…", options: ["Toujours la même chose", "Le plat du jour", "Le plus original", "Ce que prend son voisin"] },
  { text: "Le défaut principal de {name} ?", options: ["Toujours en retard", "Gourmand", "Têtu", "Bavard"] },
  { text: "La boisson préférée de {name} ?", options: ["Eau", "Soda", "Jus de fruits", "Sirop"] },
  { text: "Quel animal ressemble le plus à {name} ?", options: ["Lion", "Paresseux", "Renard", "Dauphin"] },
  { text: "{name} se réveille plutôt…", options: ["Avant le réveil", "Au premier réveil", "Après 3 rappels", "Jamais sans aide"] },
  { text: "La pizza idéale de {name} ?", options: ["Margherita", "4 fromages", "Avec de l'ananas", "Chorizo"] },
];

export const QUIZ_ROUND_CHOICES = [5, 8, 12] as const;

export interface QuizState {
  round: number;
  rounds: number;
  /** Le joueur sur qui porte la question. */
  star: string;
  question: { text: string; options: string[] };
  phase: "answer" | "reveal";
  endsAt: number | null;
  /** Qui a déjà répondu (les réponses restent secrètes jusqu'à la révélation). */
  answered: string[];
  /** Révélation : la réponse de la vedette et les paris des autres. */
  starAnswer: number | null;
  guesses: Record<string, number> | null;
  scores: Record<string, number>;
}

// ───────────── Bombe à mots ─────────────

export const WORD_CATEGORIES: Record<string, string[]> = {
  "Fruits": ["pomme", "poire", "banane", "fraise", "cerise", "kiwi", "mangue", "ananas", "abricot", "pêche", "prune", "raisin", "melon", "orange", "citron", "framboise", "myrtille", "figue", "litchi", "pastèque"],
  "Animaux": ["chat", "chien", "lion", "tigre", "girafe", "zèbre", "éléphant", "souris", "lapin", "cheval", "vache", "mouton", "loup", "renard", "ours", "singe", "aigle", "dauphin", "requin", "tortue"],
  "Pays": ["France", "Espagne", "Italie", "Allemagne", "Japon", "Chine", "Brésil", "Canada", "Mexique", "Maroc", "Belgique", "Suisse", "Portugal", "Inde", "Égypte", "Norvège", "Grèce", "Pérou", "Australie", "Irlande"],
  "Métiers": ["boulanger", "médecin", "pompier", "policier", "professeur", "pilote", "cuisinier", "plombier", "architecte", "dentiste", "facteur", "coiffeur", "vétérinaire", "infirmier", "électricien", "avocat", "journaliste", "jardinier", "boucher", "fleuriste"],
  "Sports": ["football", "tennis", "rugby", "natation", "judo", "basket", "handball", "ski", "boxe", "golf", "escalade", "cyclisme", "volley", "badminton", "surf", "athlétisme", "escrime", "équitation", "karaté", "patinage"],
  "Légumes": ["carotte", "poireau", "tomate", "courgette", "aubergine", "salade", "chou", "brocoli", "radis", "navet", "épinard", "haricot", "petit pois", "concombre", "poivron", "oignon", "potiron", "betterave", "céleri", "artichaut"],
  "Dans une cuisine": ["fourchette", "casserole", "poêle", "frigo", "four", "louche", "spatule", "assiette", "verre", "couteau", "passoire", "fouet", "bol", "tasse", "torchon", "évier", "planche", "râpe", "plat", "cuillère"],
  "Vêtements": ["pantalon", "chemise", "pull", "chaussette", "veste", "manteau", "jupe", "robe", "écharpe", "bonnet", "gant", "short", "t-shirt", "casquette", "pyjama", "ceinture", "cravate", "sweat", "blouson", "chaussure"],
  "Instruments de musique": ["piano", "guitare", "violon", "batterie", "flûte", "trompette", "harpe", "saxophone", "accordéon", "clarinette", "violoncelle", "ukulélé", "tambour", "xylophone", "orgue", "harmonica", "basse", "trombone", "triangle", "banjo"],
  "Couleurs": ["rouge", "bleu", "vert", "jaune", "orange", "violet", "rose", "noir", "blanc", "gris", "marron", "turquoise", "beige", "doré", "argenté", "bordeaux", "kaki", "indigo", "corail", "lilas"],
  "Villes de France": ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Bordeaux", "Lille", "Rennes", "Strasbourg", "Montpellier", "Brest", "Dijon", "Grenoble", "Angers", "Nancy", "Rouen", "Tours", "Limoges", "Saintes"],
  "À la plage": ["sable", "parasol", "serviette", "maillot", "seau", "pelle", "crème solaire", "vague", "coquillage", "crabe", "mouette", "glace", "lunettes", "bouée", "château de sable", "palmes", "masque", "tuba", "transat", "frisbee"],
};

export const WORD_BOMB_CHOICES = [3, 5, 8] as const;

export interface MotsState {
  category: string;
  holder: string | null;
  /** Mot proposé par le porteur, en attente de validation par les autres. */
  pending: { word: string; spoken: boolean; votes: Record<string, boolean> } | null;
  /** Mots déjà utilisés avec cette catégorie. */
  used: string[];
  bomb: number;
  bombs: number;
  /** Explosions subies par joueur (le moins gagne). */
  booms: Record<string, number>;
  blast: { playerId: string; at: number } | null;
  heat: 0 | 1 | 2;
  phase: "play" | "boom" | "done";
}

/** Mise en forme simple pour comparer les mots (sans accents ni majuscules). */
export function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim();
}
