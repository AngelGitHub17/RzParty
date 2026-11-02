import {
  DEFAULT_AVATAR,
  isValidRoomCode,
  normalizeRoomCode,
  randomAvatar,
  sanitizeName,
  type ProfileCard,
  type PublicProfile,
  type Seat,
} from "@rzparty/shared";
import { request, socket, ServerError } from "../net/connection.ts";
import { storage } from "../net/storage.ts";
import { clear, h, svg } from "../ui/dom.ts";
import { wordmark } from "../ui/brand.ts";
import { avatarSvg } from "../ui/avatar.ts";
import { openAvatarEditor } from "../ui/avatarEditor.ts";
import { openPinPad } from "../ui/pinPad.ts";
import { toast } from "../ui/toast.ts";

const LOCK = `<svg viewBox="0 0 16 18" width="14" height="16" aria-hidden="true"><rect x="2" y="8" width="12" height="9" rx="2" fill="#1E2A4A"/><path d="M5 8V5.5a3 3 0 0 1 6 0V8" stroke="#1E2A4A" stroke-width="2" fill="none"/></svg>`;

type Chosen = { kind: "profile"; profile: PublicProfile; token: string } | { kind: "guest" };

export interface EntryOptions {
  variant: "manette" | "jouer";
  urlCode: string;
  message?: string;
  navigate(path: string): void;
  onSeat(seat: Seat): void;
}

/**
 * Écran d'arrivée d'un joueur : choisir son profil (ou en créer un, ou jouer en invité),
 * puis rejoindre un salon avec son code, ou en créer un.
 */
export function mountEntry(shell: HTMLElement, opts: EntryOptions): () => void {
  let chosen: Chosen | null = null;
  /** Profils déjà ouverts sur cet appareil (les seuls affichés : la liste complète reste privée). */
  let known: PublicProfile[] = [];
  let search = "";
  let searchResult: { kind: "missing"; name: string } | null = null;
  let busy = false;
  let message = opts.message ?? "";
  let alive = true;

  const main = h("main", { class: "entry" });
  shell.append(main);

  async function loadKnown(): Promise<void> {
    const found: PublicProfile[] = [];
    for (const [id, token] of Object.entries(storage.profileTokens)) {
      try {
        found.push(await request("profile:me", { token }));
      } catch {
        storage.forgetProfile(id);
      }
    }
    known = found.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  /** Recherche par pseudo : ouvre le profil s'il existe, sinon propose de le créer. */
  async function findByName(name: string): Promise<void> {
    const clean = sanitizeName(name);
    if (!clean) return;
    search = clean;
    try {
      const card = await request("profile:find", { name: clean });
      searchResult = null;
      await choose(card);
    } catch (err) {
      if (err instanceof ServerError && /Aucun profil/.test(err.message)) {
        searchResult = { kind: "missing", name: clean };
        render();
      } else toast(err instanceof ServerError ? err.message : "Recherche impossible.", "error");
    }
  }

  /** Ouvre un profil : jeton déjà connu de l'appareil, sinon PIN si besoin. */
  async function choose(profile: ProfileCard | PublicProfile): Promise<void> {
    const known = storage.profileTokens[profile.id];
    if (known) {
      try {
        const fresh = await request("profile:me", { token: known });
        chosen = { kind: "profile", profile: fresh, token: known };
        storage.rememberProfile(profile.id, known);
        return render();
      } catch {
        storage.forgetProfile(profile.id);
      }
    }
    const open = async (pin?: string) => {
      const access = await request("profile:unlock", { profileId: profile.id, pin });
      storage.rememberProfile(access.profile.id, access.token);
      if (access.tampered) toast("Bien essayé, sauvegarde effacée ! Ce profil avait été modifié à la main.", "error");
      chosen = { kind: "profile", profile: access.profile, token: access.token };
      render();
    };
    if (profile.hasPin) {
      openPinPad({ title: `Code PIN de ${profile.name}`, onSubmit: (pin) => open(pin) });
    } else {
      try {
        await open();
      } catch (err) {
        toast(err instanceof ServerError ? err.message : "Profil indisponible.", "error");
      }
    }
  }

  function createProfile(name?: string): void {
    openAvatarEditor({
      mode: "create",
      name,
      avatar: randomAvatar(Math.random),
      async onSave({ name, avatar, pin }) {
        const access = await request("profile:create", { name, avatar, pin: pin ?? undefined });
        storage.rememberProfile(access.profile.id, access.token);
        chosen = { kind: "profile", profile: access.profile, token: access.token };
        toast(`Profil « ${access.profile.name} » créé.`);
        render();
      },
    });
  }

  function editProfile(): void {
    if (chosen?.kind !== "profile") return;
    const { profile, token } = chosen;
    openAvatarEditor({
      mode: "edit",
      name: profile.name,
      avatar: profile.avatar,
      hasPin: profile.hasPin,
      stats: profile.stats,
      async onSave({ name, avatar, pin }) {
        const updated = await request("profile:update", { token, name, avatar, pin });
        chosen = { kind: "profile", profile: updated, token };
        render();
      },
    });
  }

  // ───────────── Étape 1 : qui joue ? ─────────────

  function renderPicker(): HTMLElement {
    const last = storage.lastProfileId;
    const ordered = [...known].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
    const cards = ordered.map((p) =>
      h(
        "button",
        { class: `who${p.id === last ? " who--last" : ""}`, attrs: { type: "button", title: `Jouer avec ${p.name}` }, on: { click: () => void choose(p) } },
        avatarSvg(p.avatar, { size: 64 }),
        h("span", { class: "who__name" }, h("span", { text: p.name }), p.hasPin ? svg(LOCK) : null),
        h("small", { class: "who__meta", text: p.stats.gamesWon ? `${p.stats.gamesWon} victoire${p.stats.gamesWon > 1 ? "s" : ""}` : p.stats.gamesPlayed ? `${p.stats.gamesPlayed} partie${p.stats.gamesPlayed > 1 ? "s" : ""}` : "nouveau" }),
      ),
    );
    const nameInput = h("input", {
      class: "input",
      attrs: { id: "who-name", maxlength: 16, autocomplete: "nickname", placeholder: "Ton pseudo", value: search, "aria-label": "Ton pseudo" },
    });
    return h(
      "section",
      { class: "panel entry__picker" },
      h("h1", { text: "Qui joue ?" }),
      message ? h("p", { class: "form-error", attrs: { role: "alert" }, text: message }) : null,
      cards.length ? h("p", { class: "muted", text: "Déjà utilisés sur cet appareil :" }) : null,
      cards.length ? h("div", { class: "who-grid" }, ...cards) : null,
      h(
        "form",
        { class: "who-search", on: { submit: (e) => (e.preventDefault(), void findByName(nameInput.value)) } },
        h("label", { attrs: { for: "who-name" }, text: cards.length ? "Quelqu'un d'autre ? Tape ton pseudo" : "Tape ton pseudo pour retrouver ton profil" }),
        h("div", { class: "who-search__row" }, nameInput, h("button", { class: "btn btn--go", attrs: { type: "submit" }, text: "Continuer" })),
      ),
      searchResult
        ? h(
            "div",
            { class: "who-missing" },
            h("p", { text: `Aucun profil « ${searchResult.name} » sur ce PC.` }),
            h("button", { class: "btn btn--go", attrs: { type: "button" }, text: `Créer le profil « ${searchResult.name} »`, on: { click: () => createProfile(searchResult!.name) } }),
          )
        : h("button", { class: "btn btn--ghost who-new", attrs: { type: "button" }, text: "Créer un nouveau profil", on: { click: () => createProfile() } }),
      h("button", {
        class: "link-btn",
        attrs: { type: "button" },
        text: "Jouer en invité, sans profil",
        on: { click: () => ((chosen = { kind: "guest" }), render()) },
      }),
    );
  }

  // ───────────── Étape 2 : rejoindre ─────────────

  function renderJoin(c: Chosen): HTMLElement {
    const nameInput =
      c.kind === "guest"
        ? h("input", { class: "input", attrs: { id: "p-name", maxlength: 16, autocomplete: "nickname", placeholder: "Ton pseudo", value: storage.lastName } })
        : null;
    const codeInput = h("input", {
      class: "input input--code",
      attrs: { id: "p-code", maxlength: 4, autocomplete: "off", autocapitalize: "characters", spellcheck: "false", placeholder: "ABCD", value: opts.urlCode },
    });
    const error = h("p", { class: "form-error", attrs: { role: "alert" } }, message);

    const submit = async (mode: "join" | "create") => {
      if (busy) return;
      let identity: { profileToken: string } | { name: string };
      if (c.kind === "profile") identity = { profileToken: c.token };
      else {
        const name = sanitizeName(nameInput!.value);
        if (!name) {
          error.textContent = "Choisis un pseudo.";
          nameInput!.focus();
          return;
        }
        storage.lastName = name;
        identity = { name };
      }
      const code = normalizeRoomCode(codeInput.value);
      if (mode === "join" && !isValidRoomCode(code)) {
        error.textContent = "Le code fait 4 lettres. Il est affiché sur l'écran de la partie.";
        codeInput.focus();
        return;
      }
      busy = true;
      error.textContent = "";
      try {
        const seat = mode === "join" ? await request("player:join", { code, ...identity }) : await request("player:create", identity);
        opts.onSeat(seat);
      } catch (err) {
        error.textContent = err instanceof ServerError ? err.message : "Connexion impossible.";
        if (c.kind === "profile" && err instanceof ServerError && /profil n'existe/.test(err.message)) {
          storage.forgetProfile(c.profile.id);
        }
      } finally {
        busy = false;
      }
    };

    const avatar = c.kind === "profile" ? c.profile.avatar : DEFAULT_AVATAR;
    const form = h(
      "form",
      { class: "panel entry__form", on: { submit: (e) => (e.preventDefault(), void submit("join")) } },
      h("div", { class: "entry__pawn" }, avatarSvg(avatar, { size: 96 })),
      c.kind === "profile"
        ? h(
            "div",
            { class: "entry__who" },
            h("h1", { text: `Salut ${c.profile.name} !` }),
            h(
              "div",
              { class: "entry__links" },
              h("button", { class: "link-btn", attrs: { type: "button" }, text: "Modifier mon profil", on: { click: editProfile } }),
              h("button", { class: "link-btn", attrs: { type: "button" }, text: "Ce n'est pas moi", on: { click: () => ((chosen = null), (message = ""), render()) } }),
            ),
          )
        : h(
            "div",
            { class: "entry__who" },
            h("h1", { text: "Jouer en invité" }),
            h("button", { class: "link-btn", attrs: { type: "button" }, text: "Choisir un profil plutôt", on: { click: () => ((chosen = null), render()) } }),
          ),
      nameInput ? h("label", { attrs: { for: "p-name" }, text: "Pseudo" }) : null,
      nameInput,
      h("label", { attrs: { for: "p-code" }, text: "Code du salon" }),
      codeInput,
      error,
      h("button", { class: "btn btn--go btn--big", attrs: { type: "submit" }, text: "Rejoindre" }),
      opts.variant === "jouer"
        ? h(
            "div",
            { class: "entry__alt" },
            h("span", { class: "muted", text: "Pas de code ?" }),
            h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Créer un salon", on: { click: () => void submit("create") } }),
          )
        : null,
    );
    queueMicrotask(() => (nameInput && !nameInput.value ? nameInput : opts.urlCode ? null : codeInput)?.focus());
    return form;
  }

  function render(): void {
    if (!alive) return;
    clear(main);
    main.append(
      h("a", { class: "entry__brand", attrs: { href: "/" }, on: { click: (e) => (e.preventDefault(), opts.navigate("/")) } }, wordmark("small")),
      chosen ? renderJoin(chosen) : renderPicker(),
    );
  }

  const onProfilesChanged = async () => {
    await loadKnown();
    if (chosen?.kind === "profile") {
      const id = chosen.profile.id;
      if (known.some((p) => p.id === id)) return;
      chosen = null;
    }
    render();
  };
  socket.on("profiles:changed", onProfilesChanged);

  main.append(h("p", { class: "loading", text: "Chargement…" }));
  void (async () => {
    await loadKnown();
    // L'appareil se souvient du dernier profil utilisé : on le reprend directement.
    const last = storage.lastProfileId;
    const lastProfile = known.find((p) => p.id === last);
    if (lastProfile && storage.profileTokens[lastProfile.id]) await choose(lastProfile);
    if (!chosen) render();
  })();

  return () => {
    alive = false;
    socket.off("profiles:changed", onProfilesChanged);
  };
}
