import {
  BOARD_SIZES,
  type BoardSize,
  BOT_PERSONALITIES,
  DIFFICULTIES,
  GAME_MODES,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  PLAYER_COLORS,
  SURVIVAL_LIVES_CHOICES,
  SURVIVAL_SCORE_CHOICES,
  TEAM_CHOICES,
  WHEEL_ROUND_CHOICES,
  QUIZ_ROUND_CHOICES,
  WORD_BOMB_CHOICES,
  GLOBE_ROUND_CHOICES,
  TRIOS_ROUND_CHOICES,
  BOAT_GOAL_CHOICES,
  PAIRES_TOUR_CHOICES,
  AMITIE_ROUND_CHOICES,
  CRIS_POINT_CHOICES,
  CACHE_TOUR_CHOICES,
  TICTAC_BOMB_CHOICES,
  INTRUS_ROUND_CHOICES,
  LIBRE_ROUND_CHOICES,
  BATAILLE_PULL_CHOICES,
  SOLO_STAGE_CHOICES,
  SOLO_LIVES_CHOICES,
  type BotPersonality,
  type Difficulty,
  type GameModeId,
  type PublicPlayer,
  type RoomSnapshot,
  type SettingsPatch,
} from "@rzparty/shared";
import { h, svg } from "./dom.ts";
import { playerAvatar } from "./avatar.ts";
import { boardConfigPanel } from "./boardConfigPanel.ts";
import { activeMiniGames, miniGamePicker } from "./miniGamePicker.ts";

const CROWN = `<svg class="crown" viewBox="0 0 24 18" width="22" height="16" aria-hidden="true"><path d="M2 15 1 4l6 5 5-8 5 8 6-5-1 11z" fill="#FFC83D" stroke="#B9850B" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** Mémorise les joueurs déjà vus pour ne faire sauter que les nouveaux arrivants. */
const seen = new WeakMap<HTMLElement, Set<string>>();

function arriving(host: HTMLElement, id: string): boolean {
  let set = seen.get(host);
  if (!set) {
    set = new Set();
    seen.set(host, set);
  }
  if (set.has(id)) return false;
  set.add(id);
  return true;
}

function badges(p: PublicPlayer, meId?: string): HTMLElement {
  return h(
    "span",
    { class: "badges" },
    p.id === meId ? h("span", { class: "badge badge--me", text: "toi" }) : null,
    p.isBot && p.botPersonality ? h("span", { class: "badge", text: `bot ${BOT_PERSONALITIES[p.botPersonality].label.toLowerCase()}` }) : null,
    !p.connected ? h("span", { class: "badge badge--away", text: "déconnecté" }) : null,
  );
}

/**
 * Scène du salon pour l'écran commun : huit socles, un pion par joueur.
 * `host` est le conteneur persistant, pour animer seulement les arrivées.
 */
export function renderStage(host: HTMLElement, snapshot: RoomSnapshot): HTMLElement {
  const slots: HTMLElement[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = snapshot.players[i];
    if (!p) {
      slots.push(h("li", { class: "slot slot--empty" }, h("div", { class: "plinth" }), h("span", { class: "slot__name", text: "Place libre" })));
      continue;
    }
    const isNew = arriving(host, p.id);
    slots.push(
      h(
        "li",
        { class: `slot${isNew ? " slot--arrive" : ""}${p.connected ? "" : " slot--away"}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
        p.isChef ? svg(CROWN) : null,
        playerAvatar(p, { sleepy: !p.connected, size: 104 }),
        h("div", { class: "plinth" }, h("span", { text: String(i + 1) })),
        h("span", { class: "slot__name", text: p.name }),
        badges(p),
      ),
    );
  }
  return h("ol", { class: "stage", attrs: { "aria-label": "Joueurs du salon" } }, ...slots);
}

export interface RosterActions {
  removeBot(id: string): void;
  kick(id: string): void;
}

/** Liste des joueurs pour la manette et l'écran individuel. */
export function renderRoster(host: HTMLElement, snapshot: RoomSnapshot, meId: string, actions?: RosterActions): HTMLElement {
  const rows = snapshot.players.map((p) => {
    const isNew = arriving(host, p.id);
    const action =
      actions && p.id !== meId
        ? h("button", {
            class: "icon-btn",
            attrs: { type: "button", "aria-label": p.isBot ? `Retirer ${p.name}` : `Exclure ${p.name}`, title: p.isBot ? "Retirer ce bot" : "Exclure ce joueur" },
            text: "×",
            on: { click: () => (p.isBot ? actions.removeBot(p.id) : actions.kick(p.id)) },
          })
        : null;
    return h(
      "li",
      { class: `roster__row${isNew ? " roster__row--arrive" : ""}${p.connected ? "" : " roster__row--away"}` },
      playerAvatar(p, { sleepy: !p.connected, size: 44 }),
      h("span", { class: "roster__name" }, p.isChef ? svg(CROWN) : null, h("span", { text: p.name })),
      badges(p, meId),
      action,
    );
  });
  const free = MAX_PLAYERS - snapshot.players.length;
  return h(
    "div",
    { class: "roster" },
    h("ul", { class: "roster__list" }, ...rows),
    free > 0 ? h("p", { class: "muted", text: free === 1 ? "1 place libre" : `${free} places libres` }) : null,
  );
}

/** Sélecteur de couleur du joueur ; les couleurs prises sont grisées. */
export function renderColorPicker(snapshot: RoomSnapshot, meId: string, choose: (color: number) => void): HTMLElement {
  const me = snapshot.players.find((p) => p.id === meId);
  return h(
    "div",
    { class: "swatches", attrs: { role: "radiogroup", "aria-label": "Ta couleur" } },
    ...PLAYER_COLORS.map((c, i) => {
      const taken = snapshot.players.some((p) => p.color === i && p.id !== meId);
      const mine = me?.color === i;
      return h("button", {
        class: `swatch${mine ? " swatch--on" : ""}`,
        style: { "--swatch": c.hex },
        attrs: { type: "button", role: "radio", "aria-checked": mine ? "true" : "false", "aria-label": c.label, title: taken ? `${c.label} (prise)` : c.label, disabled: taken },
        on: { click: () => !mine && choose(i) },
      });
    }),
  );
}

function segmented<T extends string | number>(
  label: string,
  options: { value: T; label: string; note?: string }[],
  current: T,
  onPick: (v: T) => void,
  extraClass = "",
): HTMLElement {
  return h(
    "fieldset",
    { class: "field" },
    h("legend", { text: label }),
    h(
      "div",
      { class: `segmented${extraClass ? ` ${extraClass}` : ""}` },
      ...options.map((o) =>
        h(
          "button",
          {
            class: `segmented__opt${o.value === current ? " is-on" : ""}`,
            attrs: { type: "button", "aria-pressed": o.value === current ? "true" : "false" },
            on: { click: () => o.value !== current && onPick(o.value) },
          },
          o.label,
          o.note ? h("small", { text: o.note }) : null,
        ),
      ),
    ),
  );
}

export interface ChefActions {
  update(patch: SettingsPatch): void;
  addBot(personality: BotPersonality): void;
  start(): void;
}

/** Ce qui empêche de lancer la partie, ou null si tout est prêt. */
export function startBlocker(snapshot: RoomSnapshot): string | null {
  if (snapshot.players.length < MIN_PLAYERS_TO_START) return "Ajoute un joueur ou un bot pour lancer.";
  if (snapshot.settings.mode === "plateau" && snapshot.settings.teams > snapshot.players.length) {
    return `Il faut au moins ${snapshot.settings.teams} joueurs pour ${snapshot.settings.teams} équipes.`;
  }
  if (!snapshot.availableModes.includes(snapshot.settings.mode)) {
    return `Le mode ${GAME_MODES[snapshot.settings.mode].label} arrive dans une prochaine version.`;
  }
  return null;
}

/** Réglages du salon, modifiables uniquement par le chef. */
export function renderChefPanel(snapshot: RoomSnapshot, actions: ChefActions): HTMLElement {
  const s = snapshot.settings;
  const full = snapshot.players.length >= MAX_PLAYERS;
  const blocker = startBlocker(snapshot);

  const modeOptions = (Object.keys(GAME_MODES) as GameModeId[]).map((id) => ({
    value: id,
    label: GAME_MODES[id].label,
    note: snapshot.availableModes.includes(id) ? undefined : "bientôt",
  }));

  return h(
    "section",
    { class: "panel chef-panel", attrs: { "aria-label": "Réglages du chef" } },
    h("h2", { text: "Réglages de la partie" }),
    segmented("Mode de jeu", modeOptions, s.mode, (mode) => actions.update({ mode }), "segmented--modes"),
    h("p", { class: "muted field-help", text: GAME_MODES[s.mode].description }),
    s.mode === "survie"
      ? h(
          "div",
          { class: "field-row" },
          segmented("Fin de partie", [{ value: "vies", label: "Vies" }, { value: "score", label: "Score à atteindre" }], s.survival.rule, (rule) =>
            actions.update({ survival: { rule } }),
          ),
          s.survival.rule === "vies"
            ? segmented("Vies", SURVIVAL_LIVES_CHOICES.map((n) => ({ value: n as number, label: String(n) })), s.survival.lives, (lives) =>
                actions.update({ survival: { lives } }),
              )
            : segmented("Points", SURVIVAL_SCORE_CHOICES.map((n) => ({ value: n as number, label: String(n) })), s.survival.targetScore, (targetScore) =>
                actions.update({ survival: { targetScore } }),
              ),
        )
      : s.mode === "loto"
      ? null
      : s.mode === "trios"
      ? segmented("Nombre de tours", TRIOS_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} tours` })), s.trios.rounds, (rounds) => actions.update({ trios: { rounds } }))
      : s.mode === "bateau"
      ? segmented("Personnages à embarquer", BOAT_GOAL_CHOICES.map((n) => ({ value: n as number, label: `${n}`, note: n === 15 ? "plus facile" : "le vrai défi" })), s.bateau.goal, (goal) => actions.update({ bateau: { goal } }))
      : s.mode === "paires"
      ? segmented("Nombre de tours", PAIRES_TOUR_CHOICES.map((n) => ({ value: n as number, label: `${n} tours` })), s.paires.tours, (tours) => actions.update({ paires: { tours } }))
      : s.mode === "amitie"
      ? segmented("Nombre de questions", AMITIE_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} questions` })), s.amitie.rounds, (rounds) => actions.update({ amitie: { rounds } }))
      : s.mode === "quiz"
      ? segmented(
          "Nombre de questions",
          QUIZ_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} questions` })),
          s.quiz.rounds,
          (rounds) => actions.update({ quiz: { rounds } }),
        )
      : s.mode === "voyage"
      ? segmented(
          "Nombre de tours",
          GLOBE_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} tours` })),
          s.voyage.rounds,
          (rounds) => actions.update({ voyage: { rounds } }),
        )
      : s.mode === "mots"
      ? segmented(
          "Nombre de bombes",
          WORD_BOMB_CHOICES.map((n) => ({ value: n as number, label: `${n} bombes` })),
          s.mots.bombs,
          (bombs) => actions.update({ mots: { bombs } }),
        )
      : s.mode === "cris"
      ? segmented("Points pour gagner", CRIS_POINT_CHOICES.map((n) => ({ value: n as number, label: `${n} points` })), s.cris.points, (points) => actions.update({ cris: { points } }))
      : s.mode === "cache"
      ? segmented("Nombre de tours", CACHE_TOUR_CHOICES.map((n) => ({ value: n as number, label: n === 1 ? "1 tour" : `${n} tours`, note: "chacun cache une fois par tour" })), s.cache.tours, (tours) => actions.update({ cache: { tours } }))
      : s.mode === "bataille"
      ? segmented("Longueur de la corde", BATAILLE_PULL_CHOICES.map((n) => ({ value: n as number, label: `${n} crans`, note: "manches d'avance pour gagner" })), s.bataille.pulls, (pulls) => actions.update({ bataille: { pulls } }))
      : s.mode === "solo"
      ? h(
          "div",
          { class: "settings-stack" },
          segmented("Étapes", SOLO_STAGE_CHOICES.map((n) => ({ value: n as number, label: `${n} étapes` })), s.solo.stages, (stages) => actions.update({ solo: { stages } })),
          segmented("Vies", SOLO_LIVES_CHOICES.map((n) => ({ value: n as number, label: `${n} vies` })), s.solo.lives, (lives) => actions.update({ solo: { lives } })),
        )
      : s.mode === "intrus"
      ? segmented("Nombre de manches", INTRUS_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} manches` })), s.intrus.rounds, (rounds) => actions.update({ intrus: { rounds } }))
      : s.mode === "libre"
      ? segmented("Nombre de manches", LIBRE_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} manches` })), s.libre.rounds, (rounds) => actions.update({ libre: { rounds } }))
      : s.mode === "tictac"
      ? segmented("Nombre de bombes", TICTAC_BOMB_CHOICES.map((n) => ({ value: n as number, label: `${n} bombes` })), s.tictac.bombs, (bombs) => actions.update({ tictac: { bombs } }))
      : s.mode === "ile"
      ? null
      : s.mode === "roue"
      ? segmented(
          "Nombre de tours de roue",
          WHEEL_ROUND_CHOICES.map((n) => ({ value: n as number, label: `${n} tours` })),
          s.wheel.rounds,
          (rounds) => actions.update({ wheel: { rounds } }),
        )
      : h(
          "div",
          { class: "field-row" },
          segmented(
            "Longueur du plateau",
            (Object.keys(BOARD_SIZES) as BoardSize[]).map((size) => ({
              value: size,
              label: BOARD_SIZES[size].label,
              note: size === "perso" ? "tout régler" : `${BOARD_SIZES[size].cells} cases`,
            })),
            s.board.size,
            (size) => actions.update({ board: { size } }),
          ),
        ),
    s.mode === "plateau"
      ? segmented(
          "Équipes (tirées au hasard au lancement)",
          TEAM_CHOICES.map((n) => ({ value: n as number, label: n === 0 ? "Chacun pour soi" : `${n} équipes` })),
          s.teams,
          (teams) => actions.update({ teams }),
        )
      : null,
    s.mode === "plateau" && s.teams ? h("p", { class: "muted field-help", text: "Les coéquipiers partagent leurs pièces, les mini-jeux sont classés par équipe, et toute l'équipe gagne dès qu'un membre arrive." }) : null,
    s.mode === "plateau" && s.board.size === "perso" ? boardConfigPanel(s.board.custom, (custom) => actions.update({ board: { custom } })) : null,
    miniGamePicker(s.miniGames, (miniGames) => actions.update({ miniGames })),
    segmented(
      "Niveau des bots",
      (Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => ({ value: d, label: DIFFICULTIES[d].label })),
      s.botDifficulty,
      (botDifficulty) => actions.update({ botDifficulty }),
    ),
    h(
      "fieldset",
      { class: "field" },
      h("legend", { text: "Ajouter un bot" }),
      h(
        "div",
        { class: "bot-picker" },
        ...(Object.keys(BOT_PERSONALITIES) as BotPersonality[]).map((id) =>
          h(
            "button",
            {
              class: "bot-btn",
              attrs: { type: "button", disabled: full, title: BOT_PERSONALITIES[id].description },
              on: { click: () => actions.addBot(id) },
            },
            h("strong", { text: BOT_PERSONALITIES[id].label }),
            h("small", { text: BOT_PERSONALITIES[id].description }),
          ),
        ),
      ),
      full ? h("p", { class: "muted field-help", text: "Le salon est complet." }) : null,
    ),
    h("button", { class: "btn btn--go btn--big", attrs: { type: "button", disabled: blocker !== null }, text: "Lancer la partie", on: { click: actions.start } }),
    blocker ? h("p", { class: "muted field-help center", text: blocker }) : null,
  );
}

/** Résumé des réglages pour ceux qui ne sont pas chef. */
export function settingsSummary(snapshot: RoomSnapshot): string {
  const s = snapshot.settings;
  const games = s.miniGames.length ? ` · ${activeMiniGames(s.miniGames).length} mini-jeu(x) choisi(s)` : "";
  return baseSummary(snapshot) + games;
}

function baseSummary(snapshot: RoomSnapshot): string {
  const s = snapshot.settings;
  const mode = GAME_MODES[s.mode].label;
  if (s.mode === "survie") {
    const end = s.survival.rule === "vies" ? `${s.survival.lives} vies` : `premier à ${s.survival.targetScore} points`;
    return `${mode}, ${end}, bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  }
  const cells = s.board.size === "perso" ? s.board.custom.length : BOARD_SIZES[s.board.size].cells;
  const bots = `bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  if (s.mode === "ile") return `${mode}, 72 cases et 6 défis, ${bots}`;
  if (s.mode === "trios") return `${mode}, ${s.trios.rounds} tours, ${bots}`;
  if (s.mode === "bateau") return `${mode}, ${s.bateau.goal} personnages à embarquer, ${bots}`;
  if (s.mode === "paires") return `${mode}, ${s.paires.tours} tours, ${bots}`;
  if (s.mode === "amitie") return `${mode}, ${s.amitie.rounds} questions, ${bots}`;
  if (s.mode === "loto") return `${mode}, bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  if (s.mode === "quiz") return `${mode}, ${s.quiz.rounds} questions, bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  if (s.mode === "voyage") return `${mode}, ${s.voyage.rounds} tours, bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  if (s.mode === "mots") return `${mode}, ${s.mots.bombs} bombes, bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  if (s.mode === "cris") return `${mode}, premier à ${s.cris.points} points, ${bots}`;
  if (s.mode === "cache") return `${mode}, ${s.cache.tours} tour${s.cache.tours > 1 ? "s" : ""}, sans bots`;
  if (s.mode === "bataille") return `${mode}, Soleil contre Lune, corde de ${s.bataille.pulls} crans, ${bots}`;
  if (s.mode === "solo") return `${mode}, ${s.solo.stages} étapes, ${s.solo.lives} vies, adversaires : les bots du salon`;
  if (s.mode === "intrus") return `${mode}, ${s.intrus.rounds} manches, ${bots}`;
  if (s.mode === "libre") return `${mode}, ${s.libre.rounds} manches choisies par le chef, ${bots}`;
  if (s.mode === "tictac") return `${mode}, ${s.tictac.bombs} bombes, ${bots}`;
  if (s.mode === "roue") return `${mode}, ${s.wheel.rounds} tours, bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
  const teams = s.teams ? `, ${s.teams} équipes` : "";
  return `${mode}${teams}, plateau ${BOARD_SIZES[s.board.size].label.toLowerCase()} (${cells} cases), bots ${DIFFICULTIES[s.botDifficulty].label.toLowerCase()}`;
}
