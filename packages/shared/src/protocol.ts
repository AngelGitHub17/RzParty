import type { PlayerColorIndex } from "./constants.ts";
import type { BoardPrivate, BotPersonality, PublicProfile, RoomSnapshot, UpdateStatus } from "./types.ts";
import type { ItemId } from "./items.ts";
import type { Avatar } from "./avatar.ts";
import type { SettingsPatch } from "./settings.ts";

/** Réponse d'accusé de réception : succès avec données, ou message d'erreur lisible en français. */
export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: string };
export type AckFn<T = void> = (res: Ack<T>) => void;

/** Identité d'un joueur dans un salon : à conserver côté client pour pouvoir se reconnecter. */
export interface Seat {
  code: string;
  playerId: string;
  token: string;
}

/** Actions possibles sur le plateau. */
export type BoardAction =
  | { type: "roll" }
  | { type: "choose"; cell: number }
  | { type: "item"; item: ItemId; value?: number }
  | { type: "buy"; item: ItemId }
  | { type: "leave" }
  | { type: "duel"; target: string }
  | { type: "spin" }
  | { type: "mark"; cell: number }
  | { type: "answer"; option: number }
  | { type: "word"; word: string | null }
  | { type: "vote"; ok: boolean }
  | { type: "pick"; game: string }
  | { type: "draw"; slot: number }
  | { type: "card"; index: number; steps?: number }
  | { type: "move"; space: number }
  | { type: "travel"; space: number | null }
  | { type: "shop"; index: number | null }
  | { type: "grid"; grid: number }
  | { type: "trio"; center: number | null; slot?: number }
  | { type: "place"; slot: number }
  | { type: "flip"; card: number }
  | { type: "path"; option: number };

/** Qui rejoint : un profil (par son jeton) ou un invité (par un pseudo). */
export interface JoinIdentity {
  profileToken?: string;
  name?: string;
}

/** Ce qu'on montre d'un profil trouvé par son pseudo, avant de l'ouvrir. */
export interface ProfileCard {
  id: string;
  name: string;
  avatar: Avatar;
  hasPin: boolean;
}

/** Accès à un profil : le jeton est à garder sur l'appareil. */
export interface ProfileAccess {
  profile: PublicProfile;
  token: string;
  /** Vrai si la sauvegarde de ce profil avait été modifiée à la main (et a donc été effacée). */
  tampered: boolean;
}

/** Messages envoyés par les navigateurs au serveur. */
export interface ClientToServerEvents {
  /** L'écran commun crée un nouveau salon. */
  "screen:create": (ack: AckFn<{ code: string }>) => void;
  /** L'écran commun se rattache à un salon existant (rechargement de page). */
  "screen:watch": (payload: { code: string }, ack: AckFn) => void;

  /**
   * Un joueur crée un salon en mode écran individuel et en devient le chef.
   * Avec `profileToken` il joue avec son profil ; avec `name` seul, en invité.
   */
  "player:create": (payload: JoinIdentity, ack: AckFn<Seat>) => void;
  /** Un joueur rejoint un salon existant (manette ou écran individuel). */
  "player:join": (payload: JoinIdentity & { code: string }, ack: AckFn<Seat>) => void;
  /** Un joueur reprend sa place après une coupure grâce à son jeton. */
  "player:resume": (payload: { code: string; token: string }, ack: AckFn<Seat>) => void;
  /** Le joueur quitte volontairement le salon. */
  "player:leave": (ack: AckFn) => void;
  /** Le joueur change de couleur (si elle est libre). */
  "player:setColor": (payload: { color: PlayerColorIndex }, ack: AckFn) => void;

  /** Actions réservées au chef du salon. */
  "chef:addBot": (payload: { personality: BotPersonality }, ack: AckFn) => void;
  "chef:removeBot": (payload: { playerId: string }, ack: AckFn) => void;
  "chef:kick": (payload: { playerId: string }, ack: AckFn) => void;
  "chef:updateSettings": (payload: SettingsPatch, ack: AckFn) => void;
  "chef:start": (ack: AckFn) => void;
  /** Le chef arrête la partie (ou quitte le podium) et ramène tout le monde au salon. */
  "chef:backToLobby": (ack: AckFn) => void;

  /** Cherche un profil par son pseudo (la liste complète n'est jamais envoyée aux joueurs). */
  "profile:find": (payload: { name: string }, ack: AckFn<ProfileCard>) => void;
  /** Crée un profil (PIN facultatif, 4 chiffres) et renvoie le jeton qui permet de l'utiliser. */
  "profile:create": (payload: { name: string; avatar: Avatar; pin?: string }, ack: AckFn<ProfileAccess>) => void;
  /** Ouvre un profil existant (avec son PIN s'il en a un). */
  "profile:unlock": (payload: { profileId: string; pin?: string }, ack: AckFn<ProfileAccess>) => void;
  /** Profil associé à un jeton (appareil qui se souvient de son profil). */
  "profile:me": (payload: { token: string }, ack: AckFn<PublicProfile>) => void;
  /** Modifie son profil. `pin: null` retire le PIN, une chaîne de 4 chiffres le change. */
  "profile:update": (payload: { token: string; name?: string; avatar?: Avatar; pin?: string | null }, ack: AckFn<PublicProfile>) => void;

  /**
   * Page de l'hôte : réservée au PC qui fait tourner le serveur, et protégée par un identifiant
   * et un mot de passe créés au premier accès. Les autres messages exigent le jeton de session.
   */
  "admin:status": (ack: AckFn<{ onHost: boolean; configured: boolean }>) => void;
  "admin:setup": (payload: { login: string; password: string }, ack: AckFn<{ token: string }>) => void;
  "admin:login": (payload: { login: string; password: string }, ack: AckFn<{ token: string }>) => void;
  "admin:logout": (payload: { token: string }, ack: AckFn) => void;
  "admin:list": (payload: { token: string }, ack: AckFn<PublicProfile[]>) => void;
  "admin:rename": (payload: { token: string; profileId: string; name: string }, ack: AckFn) => void;
  "admin:clearPin": (payload: { token: string; profileId: string }, ack: AckFn) => void;
  "admin:resetStats": (payload: { token: string; profileId: string }, ack: AckFn) => void;
  "admin:delete": (payload: { token: string; profileId: string }, ack: AckFn) => void;
  "admin:updateStatus": (payload: { token: string }, ack: AckFn<UpdateStatus>) => void;
  "admin:updateInstall": (payload: { token: string }, ack: AckFn<{ restarting: boolean; log: string[] }>) => void;

  /** Le joueur a lu les règles et est prêt. */
  "game:ready": (ack: AckFn) => void;
  /** Action sur le plateau : lancer le dé, choisir un chemin. */
  "game:action": (payload: BoardAction, ack: AckFn) => void;
  /** Action dans le mini-jeu en cours. `round` évite qu'une action en retard touche la manche suivante. */
  "game:input": (payload: { round: number; input: unknown }) => void;
}

/** Messages envoyés par le serveur aux navigateurs. */
export interface ServerToClientEvents {
  /** Nouvel état complet du salon. */
  "room:state": (snapshot: RoomSnapshot) => void;
  /** Le salon n'existe plus. */
  "room:closed": (payload: { reason: string }) => void;
  /** Ce joueur a été retiré du salon par le chef. */
  "room:kicked": () => void;
  /** Petit message à afficher brièvement. */
  "room:notice": (payload: { message: string }) => void;
  /** État visible du mini-jeu en cours (spécifique à chaque mini-jeu). */
  "mg:state": (payload: { round: number; state: unknown }) => void;
  /** Information privée du mini-jeu, pour ce joueur seulement. */
  "mg:private": (payload: { round: number; data: unknown }) => void;
  "board:private": (payload: BoardPrivate) => void;
  /** La liste des profils a changé (création, modification, suppression). */
  "profiles:changed": () => void;
  /** Le serveur s'arrête ou change de port : inutile d'essayer de se reconnecter ici. */
  "server:stopping": () => void;
}

/** Messages d'erreur partagés, pour garder le même vocabulaire partout. */
export const ERRORS = {
  roomNotFound: "Aucun salon avec ce code. Vérifie les 4 lettres.",
  roomFull: "Le salon est complet (8 joueurs).",
  roomStarted: "La partie a déjà commencé dans ce salon.",
  nameRequired: "Choisis un pseudo.",
  renameNeeded: "Ton pseudo doit être changé avant de jouer (bouton « Modifier » de ton profil) :",
  notInRoom: "Tu n'es dans aucun salon.",
  notChef: "Seul le chef du salon peut faire ça.",
  colorTaken: "Cette couleur est déjà prise.",
  invalidColor: "Couleur inconnue.",
  notABot: "Ce joueur n'est pas un bot.",
  playerNotFound: "Ce joueur n'est plus dans le salon.",
  cannotKickSelf: "Tu ne peux pas te retirer toi-même.",
  notEnoughPlayers: "Il faut au moins 2 joueurs, bots compris.",
  modeUnavailable: "Ce mode de jeu n'est pas encore disponible.",
  sessionExpired: "Ta place dans ce salon a expiré. Rejoins-le à nouveau.",
  invalidBot: "Personnalité de bot inconnue.",
  noGame: "Aucune partie en cours.",
  notYourTurn: "Ce n'est pas ton tour.",
  notEnoughCoins: "Pas assez de pièces.",
  itemsFull: "Ton sac est plein.",
  oneItemPerTurn: "Un seul objet par tour.",
  profileNotFound: "Ce profil n'existe plus.",
  profileLocked: "Ce profil est protégé : entre son code PIN.",
  wrongPin: "Code PIN incorrect.",
  pinLocked: "Trop d'essais. Réessaie dans 30 secondes.",
  invalidPin: "Le code PIN doit faire 4 chiffres.",
  nameTaken: "Ce pseudo est déjà pris par un autre profil.",
  profileInRoom: "Ce profil joue déjà dans ce salon, sur un autre appareil.",
  notHost: "Cette page n'est accessible que depuis le réseau local du serveur RzParty (jamais depuis Internet).",
  noProfileWithName: "Aucun profil à ce nom.",
  adminExists: "Le compte de l'hôte existe déjà : connecte-toi.",
  adminNotSetUp: "Le compte de l'hôte n'est pas encore créé.",
  adminLoginRequired: "Choisis un identifiant.",
  adminPasswordShort: "Le mot de passe doit faire au moins 6 caractères.",
  adminWrong: "Identifiant ou mot de passe incorrect.",
  adminSession: "Ta session a expiré : reconnecte-toi.",
  badRequest: "Requête invalide.",
} as const;
