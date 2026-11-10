/**
 * Règles des pseudos : vérifiées par le serveur (profils, invités) et affichées dès la saisie.
 * Un pseudo qui ne les respecte pas est refusé avec la raison, et un profil existant fautif
 * doit être renommé avant de jouer.
 */
import { MAX_NAME_LENGTH } from "./constants.ts";
import { sanitizeName } from "./validation.ts";

export const MIN_NAME_LENGTH = 2;

/** Les règles, telles qu'on les montre aux joueurs. */
export const NAME_RULES = [
  `De ${MIN_NAME_LENGTH} à ${MAX_NAME_LENGTH} caractères, avec au moins une lettre.`,
  "Lettres (accents compris), chiffres, espaces et - _ . ' seulement.",
  "Pas d'insulte, de grossièreté ni de propos haineux.",
  "Pas d'adresse de site, de mail ou de numéro de téléphone.",
  "Pas de nom réservé (hôte, admin, modérateur, RzParty…).",
];

/**
 * Racines interdites partout dans le pseudo « aplati » (minuscules, sans accents, chiffres-lettres
 * remplacés, lettres répétées réduites, sans espaces ni ponctuation). Seulement des mots assez
 * longs et sans ambiguïté, pour ne pas toucher de prénoms ordinaires.
 */
const BANNED_ANYWHERE = [
  "connard", "connasse", "conasse", "salope", "salaud", "encule", "enkule", "batard", "putain", "filsdepute",
  "tagueule", "tapette", "tarlouze", "negre", "bougnoul", "youpin", "chinetoque", "hitler", "pedophile",
  "violeur", "branleur", "branlette", "suceur", "sucemoi", "nichon", "couille", "enfoire", "ordure", "pouffiasse",
  "grognasse", "merde", "fuck", "bitch", "asshole", "pussy", "nigger", "nigga", "faggot", "whore", "porno",
  "terroriste", "jihad", "suicide",
];
/**
 * Mots interdits seulement s'ils forment un mot entier ou tout le pseudo
 * (pour ne pas bloquer Constance, Dominique, Killian, Violette, Nazim…).
 */
const BANNED_WORDS = [
  "con", "cons", "conne", "cul", "pd", "fdp", "ntm", "tg", "nique", "niquer", "pute", "putes", "bite", "zob",
  "teub", "chatte", "foutre", "viol", "nazi", "nazis", "kkk", "sex", "sexe", "porn", "shit", "dick", "cock",
  "cunt", "slut", "kill", "killer", "tuer", "abruti", "debile", "mongol", "gogol", "retard", "pedo", "gouine",
  "bicot", "ass", "bordel",
];
/** Noms qui pourraient faire croire à un message officiel ou à l'organisateur. */
const RESERVED = ["hote", "host", "admin", "administrateur", "administrator", "moderateur", "moderator", "modo", "rzparty", "systeme", "system", "serveur", "server", "officiel", "staff", "support"];

/** Minuscules, sans accents, chiffres et symboles remplacés par les lettres qu'ils imitent. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0@4]/g, (c) => (c === "0" ? "o" : "a"))
    .replace(/1|!|\|/g, "i")
    .replace(/3/g, "e")
    .replace(/5|\$/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b");
}

/** Pseudo aplati : sans espaces ni ponctuation, lettres répétées réduites (« merrrde » → « merde »). */
function squash(text: string): string {
  return fold(text)
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/**
 * Vérifie un pseudo. Renvoie `null` s'il est correct, sinon la raison (en français, à afficher).
 */
export function nameProblem(raw: unknown): string | null {
  const name = sanitizeName(raw);
  if (!name) return "Choisis un pseudo.";
  const chars = [...name];
  if (chars.length < MIN_NAME_LENGTH) return `Ton pseudo doit faire au moins ${MIN_NAME_LENGTH} caractères.`;
  if (!/\p{L}/u.test(name)) return "Ton pseudo doit contenir au moins une lettre.";
  if (!/^[\p{L}\p{M}0-9 _.'’-]+$/u.test(name)) return "Ton pseudo ne peut contenir que des lettres, des chiffres, des espaces et - _ . '";
  if (/(.)\1{4,}/u.test(name)) return "Évite de répéter le même caractère autant de fois.";
  // Pas de liens, de mails ni de numéros de téléphone.
  if (/(www|http|\.(fr|com|net|org|io|gg|tv|be|ch)\b)/i.test(name)) return "Pas d'adresse de site dans un pseudo.";
  if (/\d{6,}/.test(name.replace(/[ ._-]/g, ""))) return "Pas de numéro de téléphone dans un pseudo.";
  const flat = squash(name);
  const words = fold(name)
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => w.replace(/(.)\1+/g, "$1"));
  const isBanned =
    BANNED_ANYWHERE.some((b) => flat.includes(squash(b))) ||
    BANNED_WORDS.some((b) => {
      const w = squash(b);
      return flat === w || words.includes(w);
    });
  if (isBanned) return "Ce pseudo contient un mot interdit (insulte, grossièreté ou propos haineux).";
  if (RESERVED.some((r) => flat === r || words.includes(r))) return "Ce pseudo est réservé : choisis-en un autre.";
  return null;
}

/** Vrai si le pseudo respecte les règles. */
export function isNameAllowed(raw: unknown): boolean {
  return nameProblem(raw) === null;
}
