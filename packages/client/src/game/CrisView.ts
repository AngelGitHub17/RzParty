import { CREATURES, type CrisState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction, with3D } from "./modeKit.ts";
import type { CrisScene } from "../three/crisScene.ts";
import { buzz, creatureCry, keepAwake, success } from "./sfx.ts";
import { hashId, secondsLeft, soundGate, whoAmI } from "./salonKit.ts";

/** Intervalle entre deux cris d'un même téléphone. */
const CRY_EVERY = 2600;

/**
 * Mode « Cris en folie ». Sur l'écran commun : la bête à trouver et les scores.
 * Sur chaque téléphone (posé au milieu de la table) : il pousse son cri, et celui qui l'attrape
 * touche « Je l'ai ! » puis son propre visage.
 */
export class CrisView {
  private readonly el: HTMLElement;
  private readonly stage3d = h("div", { class: "salon__3d" });
  private scene: CrisScene | null = null;
  private gone = false;
  private readonly head = h("div", { class: "salon__head" });
  private readonly stageBox = h("div", { class: "salon__stage" });
  private readonly action = h("div", { class: "salon__action" });
  private readonly timer = h("div", { class: "salon__timer" });
  private readonly table = h("div", {});
  private readonly gate: { refresh(): void } | null = null;
  private room: RoomSnapshot | null = null;
  private picking = false;
  private lastCry = -1;
  private seenClaim = 0;
  private stop: () => void;
  private release: () => void = () => {};

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    const main = h("div", { class: "salon__main" }, this.stage3d, this.head, this.timer, this.stageBox, this.action);
    this.el = h("section", { class: `salon salon--cris salon--${layout}` }, main, layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table));
    root.append(this.el);
    if (layout !== "pad")
      with3D(this.stage3d, () => import("../three/crisScene.ts"), ({ CrisScene }, host) => {
        if (this.gone) return false;
        this.scene = new CrisScene(host, layout !== "tv");
        const g = this.room?.game?.cris;
        if (g && this.room) this.scene.update(g, this.room.players);
        return true;
      });
    if (this.isDevice()) {
      this.gate = soundGate(main);
      this.release = keepAwake();
    }
    this.stop = everyFrame(() => this.tick());
  }

  /** Cet écran est un téléphone qui joue (pas l'écran commun). */
  private isDevice(): boolean {
    return this.layout !== "tv" && this.meId !== null;
  }

  destroy(): void {
    this.gone = true;
    this.scene?.destroy();
    this.stop();
    this.release();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const c = room.game?.cris;
    if (!c) return;
    this.scene?.update(c, room.players);
    if (c.phase !== "listen") this.picking = false;
    // Son de la dernière prise (une seule fois).
    if (c.lastClaim && c.lastClaim.at !== this.seenClaim) {
      this.seenClaim = c.lastClaim.at;
      if (c.lastClaim.ok) success();
      else if (c.lastClaim.device === this.meId || this.layout === "tv") buzz();
    }
    this.renderHead(c);
    this.renderStage(c, room);
    this.renderAction(c, room);
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(c.scores), (id) => c.scores[id] ?? 0, (id) => `${c.scores[id] ?? 0}/${c.goal}`, { meId: this.meId }));
    this.gate?.refresh();
  }

  private tick(): void {
    const c = this.room?.game?.cris;
    if (!c) return;
    const left = secondsLeft(c.endsAt);
    this.timer.textContent = left === null || c.phase === "claimed" ? "" : `⏱ ${left} s`;
    // Le téléphone crie à intervalle régulier, décalé selon son propriétaire.
    if (!this.isDevice() || c.phase !== "listen" || c.listenAt === null) return;
    const mine = c.sounds[this.meId!];
    if (mine === undefined) return;
    const k = Math.floor((serverNow() - c.listenAt - (hashId(this.meId!) % 900)) / CRY_EVERY);
    if (k >= 0 && k !== this.lastCry) {
      this.lastCry = k;
      creatureCry(CREATURES[mine]!.id);
    }
  }

  private renderHead(c: CrisState): void {
    clear(this.head);
    this.head.append(h("small", { text: `Manche ${c.round} · premier à ${c.goal} points` }));
  }

  private renderStage(c: CrisState, room: RoomSnapshot): void {
    clear(this.stageBox);
    if (c.phase === "wait") {
      this.stageBox.append(h("p", { class: "salon__big", text: "Il faut au moins 2 téléphones connectés pour jouer…" }));
      return;
    }
    if (c.phase === "place") {
      this.stageBox.append(
        h("div", { class: "salon__emoji", text: "📱📱📱" }),
        h("p", { class: "salon__big", text: "Posez les téléphones au milieu de la table, écran vers le haut, son à fond !" }),
        h("p", { class: "muted", text: "Chaque téléphone va pousser le cri d'une bête. Les mains sur la tête en attendant !" }),
      );
      return;
    }
    const target = c.target === null ? null : CREATURES[c.target]!;
    if (c.phase === "listen" && target) {
      this.stageBox.append(
        h("p", { class: "salon__hint", text: "Attrapez le téléphone qui fait le cri de :" }),
        h("div", { class: "salon__creature" }, h("span", { class: "salon__creature-emoji", text: target.emoji }), h("strong", { text: target.label })),
      );
      if (c.lastClaim && !c.lastClaim.ok) {
        const who = room.players.find((p) => p.id === c.lastClaim!.by)?.name ?? "?";
        const said = CREATURES[c.sounds[c.lastClaim.device]!]!;
        this.stageBox.append(h("p", { class: "salon__oops", text: `Raté ! ${who} a attrapé le ${said.label.toLowerCase()} ${said.emoji}` }));
      }
      return;
    }
    if (c.phase === "claimed") {
      const claim = c.lastClaim?.ok ? c.lastClaim : null;
      const winner = claim ? room.players.find((p) => p.id === claim.by) : null;
      this.stageBox.append(
        winner ? playerAvatar(winner, { size: 96 }) : h("div", { class: "salon__emoji", text: "🤷" }),
        h("p", { class: "salon__big", text: winner ? `${winner.name} a trouvé ${target ? `le cri ${articleOf(target.label)} ${target.emoji}` : "la bonne bête"} ! +1 point` : "Personne n'a trouvé à temps !" }),
      );
      // Chaque téléphone dit quelle bête il imitait.
      const mine = this.meId ? c.sounds[this.meId] : undefined;
      if (this.isDevice() && mine !== undefined) this.stageBox.append(h("p", { class: "muted", text: `Ce téléphone faisait : ${CREATURES[mine]!.emoji} ${CREATURES[mine]!.label}` }));
    }
  }

  private renderAction(c: CrisState, room: RoomSnapshot): void {
    clear(this.action);
    if (!this.isDevice()) return;
    const mine = c.sounds[this.meId!];
    if (c.phase === "place" && mine !== undefined) {
      this.action.append(h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "🔊 Tester le son", on: { click: () => creatureCry(CREATURES[mine]!.id) } }));
      return;
    }
    if (c.phase !== "listen" || mine === undefined) return;
    if (this.picking) {
      const humans = room.players.filter((p) => !p.isBot && p.id in c.scores && !c.lockedOut.includes(p.id));
      this.action.append(
        whoAmI(
          "Qui a attrapé ce téléphone ? Touche ton visage :",
          humans,
          (by) => {
            this.picking = false;
            void sendAction({ type: "claim", by });
          },
          () => {
            this.picking = false;
            if (this.room) this.update(this.room);
          },
        ),
      );
      return;
    }
    this.action.append(
      h("button", {
        class: "btn btn--go btn--big salon__grab",
        attrs: { type: "button" },
        text: "✋ Je l'ai attrapé !",
        on: {
          click: () => {
            this.picking = true;
            if (this.room) this.update(this.room);
          },
        },
      }),
    );
  }
}

/** « du chat », « de la vache », « du hibou »… */
function articleOf(label: string): string {
  const l = label.toLowerCase();
  if (/^[aeiouyé]/.test(l)) return `de l'${l}`;
  return ["vache", "grenouille", "souris"].includes(l) ? `de la ${l}` : `du ${l}`;
}
