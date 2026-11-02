import QRCode from "qrcode";
import type { RoomSnapshot, ServerInfo } from "@rzparty/shared";
import { fetchServerInfo, lanOrigin, request, socket, ServerError } from "../net/connection.ts";
import { storage } from "../net/storage.ts";
import { clear, h, svg } from "../ui/dom.ts";
import { wordmark } from "../ui/brand.ts";
import { renderStage, settingsSummary } from "../ui/lobby.ts";
import { toast } from "../ui/toast.ts";
import type { View } from "../main.ts";
import { GameStage } from "../game/GameStage.ts";

/**
 * Écran commun (/ecran) : affiche le salon sur la télé ou le PC hôte.
 * Il ne joue pas : il montre le code, le QR code et les joueurs qui arrivent.
 */
export const screenView: View = (root) => {
  let snapshot: RoomSnapshot | null = null;
  let info: ServerInfo | undefined;
  let qrFor = "";
  let alive = true;

  const qrBox = h("div", { class: "qr", attrs: { "aria-hidden": "true" } });
  const joinUrl = h("p", { class: "join-card__url" });
  const codeTiles = h("div", { class: "code-tiles", attrs: { "aria-live": "polite" } });
  const stageHost = h("div", { class: "stage-host" });
  const status = h("p", { class: "screen-status" });
  const summary = h("p", { class: "screen-summary muted" });
  const warning = h("p", { class: "screen-warning", attrs: { hidden: true } });

  const newRoom = h("button", {
    class: "btn btn--ghost btn--small",
    attrs: { type: "button" },
    text: "Nouveau salon",
    on: { click: () => void create() },
  });

  const lobbyEl = h(
      "div",
      { class: "screen" },
      h("header", { class: "screen__top" }, wordmark("small"), newRoom),
      h(
        "main",
        { class: "screen__main" },
        h(
          "aside",
          { class: "join-card" },
          h("h1", { class: "join-card__title", text: "Rejoins la partie" }),
          h("p", { class: "join-card__lead", text: "Scanne le code avec ton téléphone." }),
          qrBox,
          h("p", { class: "join-card__or", text: "ou ouvre" }),
          joinUrl,
          h("p", { class: "join-card__or", text: "et entre le code" }),
          codeTiles,
          warning,
        ),
        h("section", { class: "stage-wrap" }, stageHost, status, summary),
      ),
    );
  root.append(lobbyEl);
  let stage: GameStage | null = null;

  function render(): void {
    if (!snapshot) return;
    // Partie en cours : l'écran commun passe en affichage de jeu.
    if (snapshot.phase === "partie" && snapshot.game) {
      lobbyEl.hidden = true;
      if (!stage) stage = new GameStage(root, "tv", null);
      stage.update(snapshot);
      return;
    }
    if (stage) {
      stage.destroy();
      stage = null;
    }
    lobbyEl.hidden = false;
    const origin = lanOrigin(info);
    const url = `${origin}/manette?code=${snapshot.code}`;

    joinUrl.textContent = `${origin.replace(/^https?:\/\//, "")}/manette`;
    clear(codeTiles);
    for (const ch of snapshot.code) codeTiles.append(h("span", { class: "code-tile", text: ch }));

    if (url !== qrFor) {
      qrFor = url;
      QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1E2A4AFF", light: "#FFFFFF00" } })
        .then((markup) => {
          if (qrFor !== url) return;
          clear(qrBox);
          qrBox.append(svg(markup));
        })
        .catch(() => qrBox.replaceChildren(h("p", { class: "muted", text: "QR code indisponible" })));
    }

    const isLocalOnly = !info?.lanAddresses.length && /^(localhost|127\.)/.test(window.location.hostname);
    warning.hidden = !isLocalOnly;
    warning.textContent = isLocalOnly ? "Ce PC n'est relié à aucun réseau : les téléphones ne pourront pas se connecter." : "";

    clear(stageHost);
    stageHost.append(renderStage(stageHost, snapshot));

    const chef = snapshot.players.find((p) => p.isChef);
    const humans = snapshot.players.filter((p) => !p.isBot);
    status.textContent = !humans.length
      ? "Le premier joueur qui se connecte devient le chef du salon."
      : chef
        ? `${chef.name} est le chef : il règle la partie et la lance depuis son téléphone.`
        : "En attente du retour d'un joueur…";
    summary.textContent = settingsSummary(snapshot);
  }

  async function create(): Promise<void> {
    try {
      const { code } = await request("screen:create");
      storage.screenCode = code;
    } catch (err) {
      toast(err instanceof ServerError ? err.message : "Impossible de créer le salon.", "error");
    }
  }

  /** Reprend le salon déjà affiché (rechargement, coupure) ou en crée un nouveau. */
  async function attach(): Promise<void> {
    const previous = storage.screenCode;
    if (previous) {
      try {
        await request("screen:watch", { code: previous });
        return;
      } catch {
        storage.screenCode = null;
      }
    }
    if (alive) await create();
  }

  const onState = (s: RoomSnapshot) => {
    snapshot = s;
    render();
  };
  const onClosed = ({ reason }: { reason: string }) => {
    toast(reason);
    storage.screenCode = null;
    void create();
  };
  const onConnect = () => void attach();

  socket.on("room:state", onState);
  socket.on("room:closed", onClosed);
  socket.on("connect", onConnect);

  void fetchServerInfo().then((i) => {
    info = i;
    render();
  });
  if (socket.connected) void attach();

  return () => {
    alive = false;
    stage?.destroy();
    socket.off("room:state", onState);
    socket.off("room:closed", onClosed);
    socket.off("connect", onConnect);
  };
};
