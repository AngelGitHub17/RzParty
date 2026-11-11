import type { ItemId } from "./items.ts";
import type { BoardConfig } from "./boardConfig.ts";
import type { WheelState } from "./wheel.ts";
import type { GlobeState } from "./globe.ts";
import type { LotoState, MotsState, QuizState } from "./partyModes.ts";
import type { AmitieState, BateauState, PairesState, TriosState } from "./familyModes.ts";
import type { IleState } from "./ile.ts";
import type { CacheState, CrisState, IntrusState, LibreState, TictacState } from "./salonModes.ts";
import type { PlayerColorIndex } from "./constants.ts";
import type { Avatar } from "./avatar.ts";
import type { Board, BoardSize, CellType } from "./board.ts";

/**
 * Mode d'affichage d'un salon.
 * - `commun` : un écran partagé (TV / PC hôte) affiche le jeu, les téléphones servent de manettes.
 * - `individuel` : chaque joueur voit le jeu sur son propre écran.
 */
export type DisplayMode = "commun" | "individuel";

/** Identifiant d'un mode de jeu. Les modes s'enregistrent côté serveur dans le registre des modes. */
export type GameModeId = "survie" | "plateau" | "roue" | "loto" | "quiz" | "mots" | "voyage" | "trios" | "bateau" | "paires" | "amitie" | "ile" | "cris" | "cache" | "tictac" | "intrus" | "libre";

export type BotPersonality = "equilibre" | "agressif" | "lent-precis" | "glitch";

export type Difficulty = "facile" | "moyen" | "difficile";

/** Règle de fin du mode Survie. */
export type SurvivalRule = "vies" | "score";

/** Réglages d'un salon, modifiables par le chef tant que la partie n'a pas commencé. */
export interface RoomSettings {
  mode: GameModeId;
  botDifficulty: Difficulty;
  /** Mode Grande Roue : nombre de tours de roue. */
  wheel: { rounds: number };
  /** Quiz entre amis : nombre de questions. */
  quiz: { rounds: number };
  /** Bombe à mots : nombre de bombes. */
  mots: { bombs: number };
  /** Tour du monde : nombre de tours. */
  voyage: { rounds: number };
  /** Trios : nombre de tours. */
  trios: { rounds: number };
  /** Bateau d'équilibre : personnages à embarquer. */
  bateau: { goal: number };
  /** Paires cachées : nombre de tours. */
  paires: { tours: number };
  /** Test d'amitié : nombre de questions. */
  amitie: { rounds: number };
  /** Cris en folie : points à atteindre. */
  cris: { points: number };
  /** Cache-cache : nombre de tours (chacun cache une fois par tour). */
  cache: { tours: number };
  /** Tic-tac-boum : nombre de bombes. */
  tictac: { bombs: number };
  /** L'intrus : nombre de manches. */
  intrus: { rounds: number };
  /** Jeu libre : nombre de manches. */
  libre: { rounds: number };
  /** Mini-jeux autorisés (vide = tous). Le chef peut n'en garder qu'un seul. */
  miniGames: string[];
  /** Mode Plateau : nombre d'équipes (0 = chacun pour soi), réparties au hasard au lancement. */
  teams: number;
  board: {
    size: BoardSize;
    /** Configuration utilisée quand `size` vaut « perso ». */
    custom: BoardConfig;
  };
  survival: {
    rule: SurvivalRule;
    lives: number;
    targetScore: number;
  };
}

/** Joueur tel que tout le monde le voit (aucune donnée secrète ici). */
export interface PublicPlayer {
  id: string;
  name: string;
  /** Couleur de place dans le salon (socle, contour, barres) : unique par salon. */
  color: PlayerColorIndex;
  avatar: Avatar;
  /** Profil utilisé (null pour un invité ou un bot). */
  profileId: string | null;
  isChef: boolean;
  isBot: boolean;
  botPersonality?: BotPersonality;
  connected: boolean;
}

/** Étape d'un salon. `partie` sera détaillé par chaque mode de jeu à partir de la phase 1. */
export type RoomPhase = "salon" | "partie";

/** Étapes d'une manche, identiques pour tous les modes. */
export type GameStage = "intro" | "countdown" | "play" | "results" | "board" | "wheel" | "loto" | "quiz" | "mots" | "globe" | "trios" | "bateau" | "paires" | "amitie" | "ile" | "cris" | "cache" | "tictac" | "intrus" | "libre" | "podium";

/** Pourquoi on joue ce mini-jeu : départager l'ordre de jeu, gagner des pièces, survivre. */
export type MiniGamePurpose = "survie" | "ordre" | "pieces" | "duel" | "cagnotte" | "loto" | "duelroue" | "voyage" | "unvstous" | "bateau" | "paires" | "amitie" | "defi" | "ile" | "ile1v3" | "ileduel";

/** Fiche publique d'un mini-jeu (affichée avant la manche). */
export interface MiniGameInfo {
  id: string;
  name: string;
  rules: string;
  category: string;
}

/** Situation d'un joueur dans la partie. */
export interface Standing {
  playerId: string;
  lives: number;
  score: number;
  eliminated: boolean;
}

/** Ce qu'a changé la dernière manche. */
export interface RoundResult {
  /** Classement : groupes d'identifiants du meilleur au moins bon (un groupe = égalité). */
  ranking: string[][];
  changes: { playerId: string; lives?: number; points?: number; eliminated?: boolean; bonusDie?: number }[];
  /** Mode équipes : classement des équipes (groupes de numéros d'équipe). */
  teams?: number[][];
}

/** État de la partie en cours (hors état interne du mini-jeu, diffusé à part). */
export interface GameSnapshot {
  mode: GameModeId;
  stage: GameStage;
  round: number;
  /** Fin prévue de l'étape, en millisecondes temps serveur (null si elle attend une action). */
  stageEndsAt: number | null;
  miniGame: MiniGameInfo | null;
  /** Joueurs qui disputent la manche en cours. */
  participants: string[];
  /** Joueurs qui ont indiqué être prêts pendant la présentation des règles. */
  ready: string[];
  standings: Standing[];
  lastResult: RoundResult | null;
  /** Gagnants, remplis au podium. */
  winners: string[];
  /** Raison du mini-jeu en cours ou qui vient de se terminer. */
  purpose: MiniGamePurpose;
  /** Mode Plateau : l'état du plateau. */
  board: BoardState | null;
  /** Mode Grande Roue : l'état de la roue. */
  wheel?: WheelState | null;
  loto?: LotoState | null;
  quiz?: QuizState | null;
  mots?: MotsState | null;
  globe?: GlobeState | null;
  trios?: TriosState | null;
  bateau?: BateauState | null;
  paires?: PairesState | null;
  amitie?: AmitieState | null;
  ile?: IleState | null;
  cris?: CrisState | null;
  cache?: CacheState | null;
  tictac?: TictacState | null;
  intrus?: IntrusState | null;
  libre?: LibreState | null;
}

export interface PawnState {
  cell: number;
  coins: number;
  /** Doit passer son prochain tour (case piège). */
  skipNext: boolean;
  /** Dé bonus gagné au dernier mini-jeu (nombre de faces : 6, 4 ou 3), ajouté au prochain lancer. */
  bonusDie: number | null;
  /** Nombre d'objets portés (leur nature reste secrète : voir l'événement « board:private »). */
  itemCount: number;
}

export type TurnPhase = "roll" | "rolling" | "move" | "choose" | "shop" | "duel" | "effect";

/** Dé d'un lancer. `kind` : dé normal, dé bonus (mini-jeu), dé à 12 faces, ou 3e dé d'un double. */
export interface DieRoll {
  sides: number;
  value: number | null;
  kind: "normal" | "bonus" | "douze" | "double";
}

export interface BoardTurn {
  playerId: string;
  phase: TurnPhase;
  /** Total des dés, connu à partir de la phase « move ». */
  dice: number | null;
  /** Dés lancés (le dé normal, plus le dé bonus éventuel). Faces connues dès le lancer, valeurs à la fin. */
  rolls: DieRoll[];
  /** Objet déjà utilisé pendant ce tour (un seul par tour). */
  usedItem: ItemId | null;
  /** Case duel : les adversaires que l'on peut défier. */
  opponents: string[] | null;
  /** Boutique ouverte (case boutique sur le chemin). */
  shop: { cell: number; offers: { item: ItemId; price: number }[] } | null;
  /** Cases parcourues par le dernier déplacement (dans l'ordre), pour l'animation. */
  path: number[];
  /** Change à chaque déplacement : les navigateurs savent qu'il faut animer. */
  moveId: number;
  /** Embranchement : les chemins proposés. */
  choices: { cell: number; label: string; length: number; detour: boolean }[] | null;
  /** Ce qui vient de se passer (case bonus, piège…). */
  effect: {
    type: CellType | "passe" | "objet";
    text: string;
    /** Case d'arrivée qui ne s'active pas (pas d'effet en chaîne) : elle est grisée. */
    blocked?: number;
  } | null;
  /** Échéance de la phase (lancer ou choix automatique), en temps serveur. */
  endsAt: number | null;
}

export interface BoardState {
  board: Board;
  order: string[];
  pawns: Record<string, PawnState>;
  turn: BoardTurn | null;
  /** Tour de plateau (tout le monde a joué une fois). */
  boardRound: number;
  /** Cases restantes jusqu'à l'arrivée, par joueur. */
  remaining: Record<string, number>;
  /** Équipe de chaque joueur (null = chacun pour soi). Les coéquipiers partagent leurs pièces. */
  teams: Record<string, number> | null;
  /** Règles de ce plateau (longueur, pas des cases, objets, limite de tours…). */
  config: BoardConfig;
  /** Brouilleur actif : pièces, places et cases restantes sont cachées (nombre de tours restants, 0 sinon). */
  scrambled: number;
}

/** Envoyé à un seul joueur : ses objets. */
export interface BoardPrivate {
  items: ItemId[];
  /** Mode « L'intrus » : c'est moi qui triche à cette manche. */
  intrus?: boolean;
}

/** État complet d'un salon, diffusé à chaque changement. */
export interface RoomSnapshot {
  code: string;
  displayMode: DisplayMode;
  phase: RoomPhase;
  players: PublicPlayer[];
  settings: RoomSettings;
  screenConnected: boolean;
  /** Modes de jeu déjà jouables sur ce serveur. */
  availableModes: GameModeId[];
  /** Partie en cours, si le salon joue. */
  game: GameSnapshot | null;
  /** Heure du serveur à l'envoi, pour caler les comptes à rebours des navigateurs. */
  serverNow: number;
}

/** Infos publiques du serveur, servies par GET /api/info. */
export interface ServerInfo {
  name: string;
  version: string;
  port: number;
  /** Adresses IPv4 du PC hôte sur le réseau local, la plus probable en premier. */
  lanAddresses: string[];
  /** Adresse publique du jeu (nom de domaine), si l'hôte en a défini une. */
  publicUrl?: string;
  /** Vrai sur le serveur en ligne : « / » montre la page de présentation, le jeu est sur « /accueil ». */
  site?: boolean;
  /** Nouvelle version publiée sur le site, si ce serveur local est en retard. */
  update?: { version: string; url: string };
}

/** Une version du journal des mises à jour (CHANGELOG.md). */
export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

/** État de la mise à jour, pour la page de l'hôte. */
export interface UpdateStatus {
  version: string;
  commit: string | null;
  /**
   * « git » : mise à jour possible depuis la page ; « archive » : dossier .zip (depuis la page ou
   * mettre-a-jour.bat) ; « installeur » : installé par le .msi, .deb ou .pkg (mise à jour toute seule).
   */
  method: "git" | "archive" | "installeur";
  /** Version plus récente annoncée par le site. */
  update: { version: string; url: string } | null;
  /** Modifications qui attendent sur GitHub (installation git). */
  pending: { hash: string; subject: string }[];
  canInstall: boolean;
  /** Le serveur redémarre tout seul après l'installation (service systemd). */
  autoRestart: boolean;
  error?: string;
}

/** Statistiques d'un profil. */
export interface ProfileStats {
  gamesPlayed: number;
  gamesWon: number;
  roundsPlayed: number;
  roundsWon: number;
  /** Manches jouées et gagnées par mini-jeu. */
  perGame: Record<string, { played: number; won: number }>;
  /** Meilleurs résultats, clés « miniJeu.record » (ex. « reflexes.reaction »). */
  records: Record<string, number>;
}

/** Profil tel que les navigateurs le voient (jamais le PIN ni les jetons). */
export interface PublicProfile {
  id: string;
  name: string;
  avatar: Avatar;
  hasPin: boolean;
  stats: ProfileStats;
  createdAt: number;
  lastSeenAt: number;
}

export function emptyStats(): ProfileStats {
  return { gamesPlayed: 0, gamesWon: 0, roundsPlayed: 0, roundsWon: 0, perGame: {}, records: {} };
}

/** Une version publiée de RzParty (page de présentation : téléchargements). */
export interface ReleaseInfo {
  version: string;
  /** Date de publication (AAAA-MM-JJ). */
  date: string;
  commit: string;
  /** La version en ligne : la seule qui se met à jour toute seule. */
  latest: boolean;
}

/** Un installeur publié (GitHub Actions) pour la version en ligne. */
export interface InstallerInfo {
  os: "windows" | "linux" | "mac";
  name: string;
  url: string;
  /** Taille en octets. */
  size: number;
  /** Adresse API GitHub du fichier (usage interne au serveur, jamais envoyée aux navigateurs). */
  asset?: string;
}
