import type { PublicProfile } from "@rzparty/shared";
import { request, socket, ServerError } from "../net/connection.ts";
import { clear, h } from "../ui/dom.ts";
import { wordmark } from "../ui/brand.ts";
import { avatarSvg } from "../ui/avatar.ts";
import { statsBlock } from "../ui/avatarEditor.ts";
import { confirmSheet } from "../ui/confirm.ts";
import { toast } from "../ui/toast.ts";
import type { View } from "../main.ts";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Page de l'hôte (/hote) : gérer tous les profils enregistrés sur ce PC.
 * Le serveur la refuse à tout autre appareil que le PC hôte.
 */
const SESSION_KEY = "rz.hostSession";
const readSession = () => {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};
const writeSession = (token: string | null) => {
  try {
    if (token) window.sessionStorage.setItem(SESSION_KEY, token);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* stockage indisponible : il faudra se reconnecter au rechargement */
  }
};

export const hostView: View = (root, { navigate }) => {
  const list = h("div", { class: "host__list" });
  const intro = h("p", { class: "muted" });
  let token = readSession();
  root.append(
    h(
      "main",
      { class: "host" },
      h(
        "header",
        { class: "host__top" },
        h("a", { attrs: { href: "/" }, on: { click: (e) => (e.preventDefault(), navigate("/")) } }, wordmark("small")),
        h("h1", { text: "Profils des joueurs" }),
      ),
      intro,
      list,
    ),
  );

  async function act(action: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await action();
      toast(done);
    } catch (err) {
      toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
      if (err instanceof ServerError && /session/.test(err.message)) {
        token = null;
        writeSession(null);
        void load();
      }
    }
  }

  /** Connexion (ou création du compte au premier accès). */
  function renderGate(configured: boolean): void {
    clear(list);
    const login = h("input", { class: "input", attrs: { id: "host-login", autocomplete: "username", maxlength: 16 } });
    const password = h("input", { class: "input", attrs: { id: "host-password", type: "password", autocomplete: configured ? "current-password" : "new-password" } });
    const confirm = configured ? null : h("input", { class: "input", attrs: { id: "host-confirm", type: "password", autocomplete: "new-password" } });
    const error = h("p", { class: "form-error", attrs: { role: "alert" } });
    intro.textContent = configured
      ? "Connecte-toi avec le compte de l'hôte pour gérer les profils."
      : "Première visite : crée le compte de l'hôte. Il protégera cette page. En cas d'oubli, supprime le fichier data\\admin.json sur ce PC.";
    list.append(
      h(
        "form",
        {
          class: "panel host__gate",
          on: {
            submit: async (e) => {
              e.preventDefault();
              if (confirm && confirm.value !== password.value) {
                error.textContent = "Les deux mots de passe ne sont pas identiques.";
                return;
              }
              try {
                const res = configured
                  ? await request("admin:login", { login: login.value, password: password.value })
                  : await request("admin:setup", { login: login.value, password: password.value });
                token = res.token;
                writeSession(token);
                void load();
              } catch (err) {
                error.textContent = err instanceof ServerError ? err.message : "Connexion impossible.";
              }
            },
          },
        },
        h("h2", { text: configured ? "Connexion" : "Créer le compte de l'hôte" }),
        h("label", { attrs: { for: "host-login" }, text: "Identifiant" }),
        login,
        h("label", { attrs: { for: "host-password" }, text: configured ? "Mot de passe" : "Mot de passe (6 caractères minimum)" }),
        password,
        confirm ? h("label", { attrs: { for: "host-confirm" }, text: "Confirme le mot de passe" }) : null,
        confirm,
        error,
        h("button", { class: "btn btn--go", attrs: { type: "submit" }, text: configured ? "Se connecter" : "Créer le compte" }),
      ),
    );
    login.focus();
  }

  function card(p: PublicProfile): HTMLElement {
    const nameInput = h("input", { class: "input", attrs: { value: p.name, maxlength: 16, "aria-label": `Nouveau pseudo pour ${p.name}` } });
    const rename = h(
      "form",
      {
        class: "host__rename",
        on: {
          submit: (e) => {
            e.preventDefault();
            if (nameInput.value.trim() !== p.name) void act(() => request("admin:rename", { token: token ?? "", profileId: p.id, name: nameInput.value }), "Pseudo modifié.");
          },
        },
      },
      nameInput,
      h("button", { class: "btn btn--ghost btn--small", attrs: { type: "submit" }, text: "Renommer" }),
    );
    return h(
      "article",
      { class: "panel host__card" },
      h(
        "div",
        { class: "host__who" },
        avatarSvg(p.avatar, { size: 72 }),
        h(
          "div",
          {},
          h("h2", { text: p.name }),
          h("p", { class: "muted", text: `Créé le ${dateFormat.format(p.createdAt)} · vu le ${dateFormat.format(p.lastSeenAt)}` }),
          h("p", { class: "muted", text: p.hasPin ? "Protégé par un code PIN" : "Sans code PIN" }),
        ),
      ),
      statsBlock(p.stats),
      rename,
      h(
        "div",
        { class: "host__actions" },
        p.hasPin
          ? h("button", {
              class: "btn btn--ghost btn--small",
              attrs: { type: "button" },
              text: "Retirer le PIN",
              on: { click: () => void act(() => request("admin:clearPin", { token: token ?? "", profileId: p.id }), `Le PIN de ${p.name} est retiré.`) },
            })
          : null,
        h("button", {
          class: "btn btn--ghost btn--small",
          attrs: { type: "button" },
          text: "Remettre les stats à zéro",
          on: {
            click: async () => {
              if (await confirmSheet(`Effacer toutes les statistiques de ${p.name} ?`, "Remettre à zéro", { danger: true }))
                void act(() => request("admin:resetStats", { token: token ?? "", profileId: p.id }), "Statistiques remises à zéro.");
            },
          },
        }),
        h("button", {
          class: "btn btn--danger btn--small",
          attrs: { type: "button" },
          text: "Supprimer",
          on: {
            click: async () => {
              if (await confirmSheet(`Supprimer définitivement le profil de ${p.name} ?`, "Supprimer", { danger: true }))
                void act(() => request("admin:delete", { token: token ?? "", profileId: p.id }), `Profil de ${p.name} supprimé.`);
            },
          },
        }),
      ),
    );
  }

  async function load(): Promise<void> {
    let status = { onHost: false, configured: false };
    try {
      status = await request("admin:status");
    } catch {
      /* serveur injoignable : traité comme « pas l'hôte » */
    }
    clear(list);
    if (!status.onHost) {
      intro.textContent = "Cette page n'est accessible que sur le PC qui fait tourner RzParty.";
      return;
    }
    if (!token) return renderGate(status.configured);
    let profiles;
    try {
      profiles = await request("admin:list", { token });
    } catch {
      token = null;
      writeSession(null);
      return renderGate(status.configured);
    }
    intro.textContent = profiles.length
      ? `${profiles.length} profil${profiles.length > 1 ? "s" : ""} enregistré${profiles.length > 1 ? "s" : ""} sur ce PC. Chaque joueur peut aussi modifier le sien depuis le jeu.`
      : "Aucun profil pour l'instant. Les joueurs créent le leur en rejoignant une partie.";
    list.append(
      h("button", {
        class: "btn btn--ghost btn--small host__logout",
        attrs: { type: "button" },
        text: "Se déconnecter",
        on: {
          click: async () => {
            await request("admin:logout", { token: token ?? "" }).catch(() => {});
            token = null;
            writeSession(null);
            void load();
          },
        },
      }),
      ...profiles.map(card),
    );
  }

  const onChanged = () => void load();
  socket.on("profiles:changed", onChanged);
  void load();
  return () => socket.off("profiles:changed", onChanged);
};
