import { normalizeRoomCode, type PublicPlayer, type RoomSnapshot, type Seat } from "@rzparty/shared";
import { request, socket, ServerError } from "../net/connection.ts";
import { storage } from "../net/storage.ts";
import { clear, h } from "../ui/dom.ts";
import { wordmark } from "../ui/brand.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { openAvatarEditor } from "../ui/avatarEditor.ts";
import { mountEntry } from "./entry.ts";
import { renderChefPanel, renderColorPicker, renderRoster, settingsSummary, startBlocker } from "../ui/lobby.ts";
import { toast } from "../ui/toast.ts";
import type { View } from "../main.ts";
import { GameStage } from "../game/GameStage.ts";

/**
 * Vue d'un joueur.
 * - `manette` (/manette) : téléphone utilisé comme manette, l'écran commun affiche le jeu.
 * - `jouer`   (/jouer)   : écran individuel, le joueur voit tout sur son propre appareil.
 * Le serveur décide du mode d'affichage du salon ; la vue se corrige d'elle-même si besoin.
 */
export function playerView(variant: "manette" | "jouer"): View {
  return (root, { navigate }) => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = normalizeRoomCode(params.get("code") ?? "");
    let seat: Seat | null = null;
    let snapshot: RoomSnapshot | null = null;
    /** Dernier état reçu : le serveur l'envoie parfois juste avant la réponse qui nous donne notre place. */
    let lastState: RoomSnapshot | null = null;
    let busy = false;
    let stage: GameStage | null = null;
    let stageLayout = "";

    const closeStage = () => {
      stage?.destroy();
      stage = null;
      stageLayout = "";
    };

    const shell = h("div", { class: `player player--${variant}` });
    root.append(shell);

    // ───────────── Formulaire d'entrée ─────────────

    let closeEntry: (() => void) | null = null;

    function showForm(message?: string): void {
      closeStage();
      closeEntry?.();
      seat = null;
      snapshot = null;
      clear(shell);
      closeEntry = mountEntry(shell, { variant, urlCode, message, navigate, onSeat: sit });
    }

    function sit(s: Seat): void {
      closeEntry?.();
      closeEntry = null;
      seat = s;
      storage.seat = s;
      clear(shell);
      shell.append(h("p", { class: "loading", text: "Connexion au salon…" }));
      if (lastState?.code === s.code) onState(lastState);
    }

    // ───────────── Salon ─────────────

    const rosterHost = h("div");

    function renderLobby(): void {
      if (!seat || !snapshot) return;
      const me = snapshot.players.find((p) => p.id === seat!.playerId);
      if (!me) return;
      const s = snapshot;

      clear(shell);
      clear(rosterHost);
      rosterHost.append(
        renderRoster(rosterHost, s, me.id, me.isChef ? { removeBot: (id) => act("chef:removeBot", { playerId: id }), kick: (id) => confirmKick(id) } : undefined),
      );

      const waiting = startBlocker(s);
      const chefName = s.players.find((p) => p.isChef)?.name;

      shell.append(
        h(
          "div",
          { class: "lobby" },
          h(
            "header",
            { class: "lobby__top" },
            wordmark("small"),
            h("span", { class: "room-chip", attrs: { "aria-label": `Salon ${s.code}` } }, h("small", { text: "Salon" }), h("strong", { text: s.code })),
          ),
          h(
            "section",
            { class: "panel me-card" },
            playerAvatar(me, { size: 88 }),
            h(
              "div",
              { class: "me-card__info" },
              h("h1", { class: "me-card__name", text: me.name }),
              h("p", { class: "muted", text: me.isChef ? "Tu es le chef : tu règles et lances la partie." : `${chefName ?? "Le chef"} lancera la partie.` }),
              renderColorPicker(s, me.id, (color) => act("player:setColor", { color })),
              me.profileId && storage.profileTokens[me.profileId]
                ? h("button", { class: "btn btn--ghost btn--small me-card__edit", attrs: { type: "button" }, text: "Modifier mon avatar", on: { click: () => void editMyProfile(me) } })
                : null,
            ),
          ),
          h("section", { class: "panel" }, h("h2", { text: `Joueurs (${s.players.length}/8)` }), rosterHost),
          me.isChef
            ? renderChefPanel(s, {
                update: (patch) => act("chef:updateSettings", patch),
                addBot: (personality) => act("chef:addBot", { personality }),
                start: () => act("chef:start"),
              })
            : h(
                "section",
                { class: "panel waiting" },
                h("h2", { text: "En attente du lancement" }),
                h("p", { text: settingsSummary(s) }),
                waiting ? h("p", { class: "muted", text: waiting }) : null,
              ),
          s.displayMode === "commun" && !s.screenConnected
            ? h("p", { class: "notice", text: "L'écran commun est déconnecté. Rouvre la page /ecran sur la télé ou le PC hôte." })
            : null,
          h("button", { class: "btn btn--ghost btn--small lobby__leave", attrs: { type: "button" }, text: "Quitter le salon", on: { click: () => void leave() } }),
        ),
      );
    }

    async function act(event: Parameters<typeof request>[0], payload?: unknown): Promise<void> {
      try {
        // Les événements du chef partagent tous la même forme (charge utile + accusé).
        await (request as (e: string, ...p: unknown[]) => Promise<unknown>)(event, ...(payload === undefined ? [] : [payload]));
      } catch (err) {
        toast(err instanceof ServerError ? err.message : "Action impossible.", "error");
      }
    }

    async function editMyProfile(me: PublicPlayer): Promise<void> {
      const token = me.profileId ? storage.profileTokens[me.profileId] : undefined;
      if (!token) return;
      try {
        const profile = await request("profile:me", { token });
        openAvatarEditor({
          mode: "edit",
          name: profile.name,
          avatar: profile.avatar,
          hasPin: profile.hasPin,
          stats: profile.stats,
          async onSave({ name, avatar, pin }) {
            await request("profile:update", { token, name, avatar, pin });
            toast("Profil enregistré.");
          },
        });
      } catch (err) {
        toast(err instanceof ServerError ? err.message : "Profil indisponible.", "error");
      }
    }

    function confirmKick(id: string): void {
      const name = snapshot?.players.find((p) => p.id === id)?.name ?? "ce joueur";
      // Confirmation dans la page plutôt qu'une boîte de dialogue du navigateur.
      const dialog = h(
        "div",
        { class: "sheet", attrs: { role: "dialog", "aria-modal": "true", "aria-label": `Exclure ${name}` } },
        h(
          "div",
          { class: "panel sheet__card" },
          h("p", { text: `Exclure ${name} du salon ?` }),
          h(
            "div",
            { class: "sheet__actions" },
            h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "Annuler", on: { click: () => dialog.remove() } }),
            h("button", { class: "btn btn--danger", attrs: { type: "button" }, text: "Exclure", on: { click: () => (dialog.remove(), void act("chef:kick", { playerId: id })) } }),
          ),
        ),
      );
      document.body.append(dialog);
    }

    async function leave(): Promise<void> {
      try {
        await request("player:leave");
      } catch {
        /* on quitte quand même côté client */
      }
      storage.seat = null;
      showForm();
    }

    // ───────────── Réseau ─────────────

    async function tryResume(): Promise<boolean> {
      const saved = storage.seat;
      if (!saved || (urlCode && saved.code !== urlCode)) return false;
      try {
        sit(await request("player:resume", { code: saved.code, token: saved.token }));
        return true;
      } catch {
        storage.seat = null;
        return false;
      }
    }

    const onState = (s: RoomSnapshot) => {
      lastState = s;
      if (!seat || s.code !== seat.code) return;
      snapshot = s;
      // Le salon impose son mode d'affichage : on corrige l'adresse sans recharger.
      const expected = s.displayMode === "commun" ? "/manette" : "/jouer";
      if (window.location.pathname !== expected) {
        history.replaceState(null, "", `${expected}?code=${s.code}`);
        shell.className = `player player--${expected.slice(1)}`;
      }
      if (s.phase === "partie" && s.game) {
        const layout = s.displayMode === "commun" ? "pad" : "solo";
        if (!stage || stageLayout !== layout) {
          closeStage();
          clear(shell);
          stage = new GameStage(shell, layout, seat.playerId);
          stageLayout = layout;
        }
        stage.update(s);
        return;
      }
      closeStage();
      renderLobby();
    };

    const onKicked = () => {
      storage.seat = null;
      showForm("Le chef t'a retiré du salon.");
    };

    const onClosed = ({ reason }: { reason: string }) => {
      storage.seat = null;
      showForm(reason);
    };

    const onConnect = () => {
      // Reconnexion automatique après une coupure (téléphone verrouillé, Wi-Fi perdu…).
      if (seat) {
        void request("player:resume", { code: seat.code, token: seat.token }).catch((err) => {
          storage.seat = null;
          showForm(err instanceof ServerError ? err.message : undefined);
        });
      }
    };

    socket.on("room:state", onState);
    socket.on("room:kicked", onKicked);
    socket.on("room:closed", onClosed);
    socket.on("connect", onConnect);

    shell.append(h("p", { class: "loading", text: "Connexion…" }));
    void tryResume().then((ok) => {
      if (!ok) showForm();
    });

    return () => {
      closeEntry?.();
      closeStage();
      socket.off("room:state", onState);
      socket.off("room:kicked", onKicked);
      socket.off("room:closed", onClosed);
      socket.off("connect", onConnect);
    };
  };
}
