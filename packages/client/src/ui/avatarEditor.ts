import {
  AVATAR_COLORS,
  AVATAR_EXTRAS,
  AVATAR_EYES,
  AVATAR_HATS,
  AVATAR_MOUTHS,
  AVATAR_SHAPES,
  MAX_NAME_LENGTH,
  randomAvatar,
  sanitizeName,
  type Avatar,
  type ProfileStats,
} from "@rzparty/shared";
import { MINI_GAME_DEFINITIONS } from "@rzparty/minigames/catalog";
import { append, clear, h } from "./dom.ts";
import { avatarSvg } from "./avatar.ts";
import type { AvatarPreview } from "../three/preview.ts";

export interface EditorValues {
  name: string;
  avatar: Avatar;
  /** undefined : PIN inchangé ; null : retirer le PIN ; "1234" : nouveau PIN. */
  pin: string | null | undefined;
}

export interface EditorOptions {
  mode: "create" | "edit";
  name?: string;
  avatar: Avatar;
  hasPin?: boolean;
  stats?: ProfileStats;
  /** Enregistre ; une erreur levée est affichée dans l'éditeur, qui reste ouvert. */
  onSave(values: EditorValues): Promise<void>;
}

type OptionKey = "shape" | "eyes" | "mouth" | "hat" | "extra";

const SECTIONS: { key: OptionKey; label: string; table: Record<string, string> }[] = [
  { key: "shape", label: "Silhouette", table: AVATAR_SHAPES },
  { key: "eyes", label: "Yeux", table: AVATAR_EYES },
  { key: "mouth", label: "Bouche", table: AVATAR_MOUTHS },
  { key: "hat", label: "Chapeau", table: AVATAR_HATS },
  { key: "extra", label: "Accessoire", table: AVATAR_EXTRAS },
];

/**
 * Éditeur de profil : pseudo, avatar (aperçu 3D qui tourne), code PIN facultatif.
 * S'ouvre par-dessus la page ; renvoie une fonction pour le fermer.
 */
export function openAvatarEditor(opts: EditorOptions): () => void {
  let avatar: Avatar = { ...opts.avatar };
  let preview: AvatarPreview | null = null;
  let closed = false;

  const nameInput = h("input", {
    class: "input",
    attrs: { id: "ed-name", maxlength: MAX_NAME_LENGTH, autocomplete: "nickname", placeholder: "Ton pseudo", value: opts.name ?? "" },
  });
  const pinInput = h("input", {
    class: "input input--pin",
    attrs: { id: "ed-pin", inputmode: "numeric", pattern: "[0-9]*", maxlength: 4, autocomplete: "off", placeholder: "••••" },
  });
  const removePin = h("input", { attrs: { type: "checkbox", id: "ed-nopin" } });
  const error = h("p", { class: "form-error", attrs: { role: "alert" } });
  const saveBtn = h("button", { class: "btn btn--go", attrs: { type: "submit" }, text: opts.mode === "create" ? "Créer mon profil" : "Enregistrer" });

  const stage = h("div", { class: "editor__stage" });
  const flatPreview = h("div", { class: "editor__flat" });
  const options = h("div", { class: "editor__options" });

  const close = () => {
    if (closed) return;
    closed = true;
    preview?.destroy();
    window.removeEventListener("keydown", onKey);
    sheet.remove();
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();

  const form = h(
    "form",
    {
      class: "editor",
      attrs: { "aria-label": opts.mode === "create" ? "Nouveau profil" : "Modifier mon profil" },
      on: { submit: (e) => (e.preventDefault(), void save()) },
    },
    h(
      "header",
      { class: "editor__head" },
      h("h1", { text: opts.mode === "create" ? "Nouveau profil" : "Mon profil" }),
      h("button", { class: "icon-btn", attrs: { type: "button", "aria-label": "Fermer" }, text: "×", on: { click: close } }),
    ),
    h(
      "div",
      { class: "editor__body" },
      h(
        "div",
        { class: "editor__preview" },
        h("div", { class: "editor__stagewrap" }, stage, h("p", { class: "editor__hint", text: "Aperçu 3D : fais-le tourner avec le doigt ou la souris" })),
        h("button", {
          class: "btn btn--ghost btn--small",
          attrs: { type: "button" },
          text: "Au hasard",
          on: { click: () => setAvatar(randomAvatar(Math.random)) },
        }),
      ),
      h(
        "div",
        { class: "editor__fields" },
        h("label", { attrs: { for: "ed-name" }, text: "Pseudo" }),
        nameInput,
        options,
        h(
          "fieldset",
          { class: "field editor__pin" },
          h("legend", { text: "Code PIN (facultatif)" }),
          h("p", {
            class: "muted field-help",
            text:
              opts.mode === "create"
                ? "Ton profil se retrouve en tapant ton pseudo : ajoute 4 chiffres pour que personne d'autre ne puisse l'utiliser. Laisse vide si tu n'en veux pas."
                : opts.hasPin
                  ? "Ton profil est protégé. Tape un nouveau code pour le changer."
                  : "Ton profil n'est pas protégé. Tape 4 chiffres pour ajouter un code.",
          }),
          pinInput,
          opts.mode === "edit" && opts.hasPin ? h("label", { class: "check" }, removePin, " Retirer le code PIN") : null,
        ),
        opts.stats ? statsBlock(opts.stats) : null,
      ),
    ),
    h("footer", { class: "editor__foot" }, error, h("div", { class: "editor__actions" }, h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Annuler", on: { click: close } }), saveBtn)),
  );

  const sheet = h("div", { class: "sheet sheet--editor", attrs: { role: "dialog", "aria-modal": "true" } }, form);
  document.body.append(sheet);
  window.addEventListener("keydown", onKey);

  function renderFlat(): void {
    clear(flatPreview);
    flatPreview.append(avatarSvg(avatar, { size: 150 }));
  }

  function setAvatar(next: Avatar): void {
    avatar = next;
    preview?.update(avatar);
    if (!preview) renderFlat();
    renderOptions();
  }

  function swatches(label: string, current: number, pick: (i: number) => void): HTMLElement {
    return h(
      "fieldset",
      { class: "field" },
      h("legend", { text: label }),
      h(
        "div",
        { class: "swatches swatches--wide", attrs: { role: "radiogroup", "aria-label": label } },
        ...AVATAR_COLORS.map((c, i) =>
          h("button", {
            class: `swatch${i === current ? " swatch--on" : ""}`,
            style: { "--swatch": c.hex },
            attrs: { type: "button", role: "radio", "aria-checked": i === current ? "true" : "false", "aria-label": c.label, title: c.label },
            on: { click: () => pick(i) },
          }),
        ),
      ),
    );
  }

  function renderOptions(): void {
    clear(options);
    append(options, [
      swatches("Couleur", avatar.body, (body) => setAvatar({ ...avatar, body })),
      swatches("Couleur d'accent (chapeau, écharpe…)", avatar.accent, (accent) => setAvatar({ ...avatar, accent })),
      ...SECTIONS.map(({ key, label, table }) =>
        h(
          "fieldset",
          { class: "field" },
          h("legend", { text: label }),
          h(
            "div",
            { class: "thumbs", attrs: { role: "radiogroup", "aria-label": label } },
            ...Object.entries(table).map(([value, text]) => {
              const on = avatar[key] === value;
              return h(
                "button",
                {
                  class: `thumb${on ? " thumb--on" : ""}`,
                  attrs: { type: "button", role: "radio", "aria-checked": on ? "true" : "false", title: text },
                  on: { click: () => setAvatar({ ...avatar, [key]: value } as Avatar) },
                },
                avatarSvg({ ...avatar, [key]: value } as Avatar, { size: 52 }),
                h("span", { text }),
              );
            }),
          ),
        ),
      ),
    ]);
  }

  async function save(): Promise<void> {
    const name = sanitizeName(nameInput.value);
    if (!name) {
      error.textContent = "Choisis un pseudo.";
      nameInput.focus();
      return;
    }
    const pinText = pinInput.value.trim();
    if (pinText && !/^\d{4}$/.test(pinText)) {
      error.textContent = "Le code PIN doit faire exactement 4 chiffres.";
      pinInput.focus();
      return;
    }
    const pin = removePin.checked ? null : pinText ? pinText : undefined;
    saveBtn.disabled = true;
    error.textContent = "";
    try {
      await opts.onSave({ name, avatar, pin });
      close();
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : "Enregistrement impossible.";
    } finally {
      saveBtn.disabled = false;
    }
  }

  renderOptions();
  renderFlat();
  stage.append(flatPreview);
  // La 3D est chargée à la demande : la page reste légère pour ceux qui n'ouvrent pas l'éditeur.
  void import("../three/preview.ts").then(({ mountAvatarPreview }) => {
    if (closed) return;
    const mounted = mountAvatarPreview(stage, avatar);
    if (mounted) {
      preview = mounted;
      flatPreview.remove();
    }
  });
  if (opts.mode === "create") nameInput.focus();

  return close;
}

/** Statistiques du profil, avec les records des mini-jeux. */
export function statsBlock(stats: ProfileStats): HTMLElement {
  const records = MINI_GAME_DEFINITIONS.flatMap((def) =>
    (def.records ?? []).flatMap((r) => {
      const value = stats.records[`${def.id}.${r.key}`];
      return value === undefined ? [] : [{ label: r.label, value: `${value}${r.unit ? ` ${r.unit}` : ""}` }];
    }),
  );
  const favourite = Object.entries(stats.perGame).sort(([, a], [, b]) => b.played - a.played)[0];
  const favName = favourite ? MINI_GAME_DEFINITIONS.find((d) => d.id === favourite[0])?.name : undefined;
  return h(
    "section",
    { class: "stats" },
    h("h2", { text: "Statistiques" }),
    h(
      "dl",
      { class: "stats__grid" },
      h("div", {}, h("dt", { text: "Parties" }), h("dd", { text: String(stats.gamesPlayed) })),
      h("div", {}, h("dt", { text: "Victoires" }), h("dd", { text: String(stats.gamesWon) })),
      h("div", {}, h("dt", { text: "Manches gagnées" }), h("dd", { text: `${stats.roundsWon} / ${stats.roundsPlayed}` })),
      favName ? h("div", {}, h("dt", { text: "Mini-jeu le plus joué" }), h("dd", { text: favName })) : null,
      ...records.map((r) => h("div", {}, h("dt", { text: r.label }), h("dd", { text: r.value }))),
    ),
  );
}
