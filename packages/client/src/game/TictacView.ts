import { BOMB_SYMBOLS, PLAYER_COLORS, WIRE_COLORS, tictacTaskText, type RoomSnapshot, type TictacState, type TictacTask } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { scoreTable, sendAction, with3D } from "./modeKit.ts";
import type { TictacScene } from "../three/tictacScene.ts";
import { buzz, explosion, success, tick } from "./sfx.ts";
import { soundGate } from "./salonKit.ts";

/**
 * Mode « Tic-tac-boum ». Le cercle des joueurs et la bombe qui passe ; le porteur voit sa consigne
 * (fils à couper, bombe à taper, bouton à maintenir, numéros dans l'ordre, symbole) et la réussit pour la passer.
 */
export class TictacView {
  private readonly el: HTMLElement;
  private readonly stage3d = h("div", { class: "salon__3d" });
  private scene: TictacScene | null = null;
  private gone = false;
  private readonly head = h("div", { class: "salon__head" });
  private readonly ring = h("div", { class: "salon__strip tictac__ring" });
  private readonly task = h("div", { class: "salon__action tictac__task" });
  private readonly bigBomb = h("div", { class: "tictac__big", text: "💣" });
  private readonly table = h("div", {});
  private readonly gate: { refresh(): void } | null = null;
  private room: RoomSnapshot | null = null;
  /** Consigne affichée (on ne la redessine pas tant qu'elle ne change pas). */
  private shownTask = -1;
  private seenBlast = 0;
  private seenSlip = 0;
  private seenPass = 0;
  private lastTick = 0;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    const main = h("div", { class: "salon__main" }, this.stage3d, this.head, this.ring, this.bigBomb, this.task);
    this.el = h("section", { class: `salon salon--tictac salon--${layout}` }, main, layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table));
    root.append(this.el);
    if (true)
      with3D(this.stage3d, () => import("../three/tictacScene.ts"), ({ TictacScene }, host) => {
        if (this.gone) return false;
        this.scene = new TictacScene(host, layout !== "tv");
        const g = this.room?.game?.tictac;
        if (g && this.room) this.scene.update(g, this.room.players);
        return true;
      });
    this.gate = soundGate(main);
    this.stop = everyFrame(() => this.tickSound(performance.now()));
  }

  destroy(): void {
    this.gone = true;
    this.scene?.destroy();
    this.stop();
    this.el.remove();
  }

  /** Le tic-tac : sur l'écran commun, et sur le téléphone du porteur. */
  private tickSound(now: number): void {
    const t = this.room?.game?.tictac;
    if (!t || t.phase !== "play") return;
    if (this.layout !== "tv" && t.holder !== this.meId && this.layout !== "solo") return;
    const every = [900, 520, 260][t.heat] ?? 900;
    if (now - this.lastTick >= every) {
      this.lastTick = now;
      tick(t.heat);
    }
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const t = room.game?.tictac;
    if (!t) return;
    this.scene?.update(t, room.players);
    if (t.blast && t.blast.at !== this.seenBlast) {
      this.seenBlast = t.blast.at;
      explosion();
    }
    if (t.slip && t.slip.at !== this.seenSlip) {
      this.seenSlip = t.slip.at;
      if (t.slip.playerId === this.meId || this.layout === "tv") buzz();
    }
    if (t.pass && t.pass.at !== this.seenPass) {
      this.seenPass = t.pass.at;
      if (t.pass.from === this.meId) success();
    }
    clear(this.head);
    this.head.append(h("small", { text: `Bombe ${t.bomb}/${t.bombs}` }));
    this.renderRing(t, room);
    this.bigBomb.className = `tictac__big heat-${t.heat}${t.phase === "boom" ? " is-boom" : ""}`;
    this.bigBomb.textContent = t.phase === "boom" ? "💥" : "💣";
    this.renderTask(t, room);
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(t.booms), (id) => t.booms[id] ?? 0, (id) => `💥 ${t.booms[id] ?? 0}`, { meId: this.meId, highlight: t.holder, ascending: true }));
    this.gate?.refresh();
  }

  private renderRing(t: TictacState, room: RoomSnapshot): void {
    clear(this.ring);
    for (const id of t.order) {
      const p = room.players.find((x) => x.id === id);
      if (!p) continue;
      const holding = t.holder === id && t.phase === "play";
      const blasted = t.phase === "boom" && t.blast?.playerId === id;
      const slipped = holding && t.slip?.playerId === id;
      this.ring.append(
        h(
          "div",
          { class: `salon__seat${holding ? ` is-holding heat-${t.heat}` : ""}${blasted ? " is-blasted" : ""}${slipped ? " is-slip" : ""}${id === this.meId ? " is-me" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          playerAvatar(p, { size: this.layout === "tv" ? 64 : 46 }),
          h("span", { class: "salon__seat-name", text: p.name }),
          holding ? h("span", { class: "tictac__bomb", text: "💣" }) : null,
          blasted ? h("span", { class: "tictac__boom", text: "BOUM !" }) : null,
        ),
      );
    }
  }

  private renderTask(t: TictacState, room: RoomSnapshot): void {
    const holderName = room.players.find((p) => p.id === t.holder)?.name ?? "?";
    if (t.phase === "boom") {
      this.shownTask = -1;
      clear(this.task);
      const victim = room.players.find((p) => p.id === t.blast?.playerId)?.name ?? "?";
      this.task.append(h("p", { class: "salon__big tictac__blast", text: t.blast?.playerId === this.meId ? "BOUM ! La bombe t'a explosé dans les mains…" : `BOUM ! ${victim} prend la bombe.` }));
      return;
    }
    if (t.phase !== "play" || !t.task) return;
    const mine = t.holder === this.meId && this.layout !== "tv";
    if (!mine) {
      this.shownTask = -1;
      clear(this.task);
      this.task.append(h("p", { class: "salon__big", text: `${holderName} a la bombe !` }), h("p", { class: "tictac__order", text: tictacTaskText(t.task) }));
      if (t.slip && t.slip.playerId === t.holder) this.task.append(h("p", { class: "salon__oops", text: "Raté ! La mèche raccourcit…" }));
      return;
    }
    if (this.shownTask === t.taskId) return;
    this.shownTask = t.taskId;
    clear(this.task);
    this.task.append(h("p", { class: "salon__big", text: "Tu as la bombe ! 💣" }), h("p", { class: "tictac__order", text: tictacTaskText(t.task) }));
    if (t.slip && t.slip.playerId === this.meId) this.task.append(h("p", { class: "salon__oops", text: "Raté ! La mèche a raccourci, nouvelle consigne :" }));
    this.task.append(taskControls(t.task, (answer) => void sendAction({ type: "task", taskId: t.taskId, answer })));
  }
}

/** Les boutons de la consigne. `send` envoie la réponse (une seule fois). */
function taskControls(task: TictacTask, send: (answer: unknown) => void): HTMLElement {
  let sent = false;
  const once = (answer: unknown) => {
    if (sent) return;
    sent = true;
    send(answer);
  };
  switch (task.kind) {
    case "fil":
      return h(
        "div",
        { class: "tictac__wires" },
        ...task.wires.map((w) =>
          h("button", {
            class: "tictac__wire",
            attrs: { type: "button", "aria-label": `Fil ${WIRE_COLORS[w]!.label}` },
            style: { "--wire": WIRE_COLORS[w]!.hex },
            on: {
              click: (e) => {
                (e.currentTarget as HTMLElement).classList.add("is-cut");
                once(w);
              },
            },
          }),
        ),
      );
    case "symbole":
      return h(
        "div",
        { class: "tictac__grid" },
        ...task.symbols.map((s) => h("button", { class: "tictac__cell", attrs: { type: "button" }, text: BOMB_SYMBOLS[s]!, on: { click: () => once(s) } })),
      );
    case "compte": {
      let n = 0;
      const count = h("strong", { class: "tictac__count", text: "0" });
      return h(
        "div",
        { class: "tictac__compte" },
        h("button", {
          class: "tictac__tap",
          attrs: { type: "button", "aria-label": "Appuyer sur la bombe" },
          text: "💣",
          on: {
            pointerdown: (e) => {
              e.preventDefault();
              n++;
              count.textContent = String(n);
            },
          },
        }),
        count,
        h("button", { class: "btn btn--go", attrs: { type: "button" }, text: "Valider", on: { click: () => once(n) } }),
      );
    }
    case "maintiens": {
      let start = 0;
      const fill = h("span", { class: "tictac__fill" });
      let raf = 0;
      const grow = () => {
        if (!start) return;
        // La jauge se remplit en 4 secondes, sans chiffres : il faut compter dans sa tête !
        fill.style.width = `${Math.min(100, ((performance.now() - start) / 4000) * 100)}%`;
        raf = requestAnimationFrame(grow);
      };
      return h(
        "div",
        { class: "tictac__hold" },
        h(
          "button",
          {
            class: "btn btn--go btn--big tictac__hold-btn",
            attrs: { type: "button" },
            text: "Maintiens…",
            on: {
              pointerdown: (e) => {
                e.preventDefault();
                start = performance.now();
                raf = requestAnimationFrame(grow);
              },
              pointerup: () => {
                if (!start) return;
                cancelAnimationFrame(raf);
                once(Math.round(performance.now() - start));
              },
              pointerleave: () => {
                if (!start) return;
                cancelAnimationFrame(raf);
                once(Math.round(performance.now() - start));
              },
              contextmenu: (e) => e.preventDefault(),
            },
          },
        ),
        h("span", { class: "tictac__gauge" }, fill),
      );
    }
    case "ordre": {
      const taps: number[] = [];
      return h(
        "div",
        { class: "tictac__grid" },
        ...task.cells.map((label, i) =>
          h("button", {
            class: "tictac__cell",
            attrs: { type: "button" },
            text: String(label),
            on: {
              click: (e) => {
                if (sent || taps.includes(i)) return;
                taps.push(i);
                (e.currentTarget as HTMLElement).classList.add("is-done");
                // Mauvais numéro : on envoie tout de suite (erreur) ; sinon on attend la fin.
                if (task.cells[i] !== taps.length || taps.length === task.cells.length) once([...taps]);
              },
            },
          }),
        ),
      );
    }
  }
}
