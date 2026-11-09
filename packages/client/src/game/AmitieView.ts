import { PLAYER_COLORS, affinity, type AmitieState, type PublicPlayer, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { sendAction } from "./modeKit.ts";

const OPTION_COLORS = ["#F45FAE", "#2F7BEF", "#2DB866", "#F2B705", "#9257E8", "#FF8A1F", "#18BDBD", "#F0483E"];

/** Mode « Test d'amitié » : la question, les réponses secrètes puis révélées, les duos et leur affinité. */
export class AmitieView {
  private readonly el: HTMLElement;
  private readonly head = h("div", { class: "quiz__head" });
  private readonly question = h("h2", { class: "quiz__question" });
  private readonly hint = h("p", { class: "quiz__hint" });
  private readonly options = h("div", { class: "quiz__options friends__options" });
  private readonly duos = h("ol", { class: "friends__duos" });
  private room: RoomSnapshot | null = null;
  private chosen = -1;
  private round = 0;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `quiz quiz--${layout} friends` },
      h("div", { class: "quiz__main" }, this.head, this.question, this.hint, this.options),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, h("h3", { class: "friends__title", text: "Duos les plus complices" }), this.duos),
    );
    root.append(this.el);
    this.stop = everyFrame(() => this.tick());
  }

  destroy(): void {
    this.stop();
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    this.room = room;
    const a = room.game?.amitie;
    if (!a) return;
    if (a.round !== this.round) {
      this.round = a.round;
      this.chosen = -1;
    }
    clear(this.head);
    this.head.append(h("small", { text: `Question ${Math.floor(a.round)}/${a.rounds}` }), h("strong", { text: a.kind === "qui" ? "Qui de nous… ?" : "Plutôt ceci ou cela ?" }));
    this.question.textContent = a.question;
    const canAnswer = this.layout !== "tv" && this.meId !== null && a.phase === "answer" && !a.answered.includes(this.meId);
    clear(this.options);
    this.options.classList.toggle("is-who", a.kind === "qui");
    a.options.forEach((opt, i) => {
      const voters = a.answers ? Object.entries(a.answers).filter(([, v]) => v === i).map(([id]) => id) : [];
      const target = a.kind === "qui" ? room.players.find((p) => p.id === opt) : undefined;
      this.options.append(
        h(
          canAnswer ? "button" : "div",
          {
            class: `quiz__option${this.chosen === i ? " is-chosen" : ""}${a.phase === "reveal" && voters.length > 1 ? " is-right" : ""}`,
            style: { "--opt": target ? (PLAYER_COLORS[target.color]?.hex ?? OPTION_COLORS[i]) : OPTION_COLORS[i % OPTION_COLORS.length] },
            attrs: canAnswer ? { type: "button" } : {},
            on: canAnswer
              ? {
                  click: async () => {
                    this.chosen = i;
                    if (!(await sendAction({ type: "answer", option: i }))) this.chosen = -1;
                    if (this.room) this.update(this.room);
                  },
                }
              : {},
          },
          target ? playerAvatar(target, { size: 44 }) : null,
          h("strong", { text: target ? target.name : opt }),
          a.phase === "reveal" ? h("span", { class: "quiz__guessers" }, ...voters.flatMap((id) => this.face(room.players, id, 26))) : null,
        ),
      );
    });
    this.renderDuos(a, room.players);
    const total = Object.keys(room.game!.standings).length;
    this.hint.textContent =
      a.phase === "reveal"
        ? "Mêmes réponses = duo plus complice !"
        : this.meId && a.answered.includes(this.meId)
          ? `Réponse envoyée ! (${a.answered.length}/${total})`
          : this.layout === "tv" || !this.meId
            ? `${a.answered.length}/${total} ont répondu`
            : "Réponds sincèrement, en secret !";
  }

  private face(players: PublicPlayer[], id: string, size: number): SVGElement[] {
    const p = players.find((x) => x.id === id);
    return p ? [playerAvatar(p, { size })] : [];
  }

  private renderDuos(a: AmitieState, players: PublicPlayer[]): void {
    if (this.layout === "pad") return;
    const ids = players.filter((p) => this.room!.game!.standings.some((s) => s.playerId === p.id)).map((p) => p.id);
    const duos: { a: string; b: string; v: number }[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) duos.push({ a: ids[i]!, b: ids[j]!, v: affinity(a, ids[i]!, ids[j]!) });
    duos.sort((x, y) => y.v - x.v);
    clear(this.duos);
    for (const d of duos.slice(0, 6)) {
      this.duos.append(
        h(
          "li",
          { class: "friends__duo" },
          ...this.face(players, d.a, 30),
          ...this.face(players, d.b, 30),
          h("span", { class: "friends__bar" }, h("span", { style: { width: `${d.v}%` } })),
          h("strong", { text: `${d.v} %` }),
        ),
      );
    }
  }

  private tick(): void {
    const a = this.room?.game?.amitie;
    if (!a || a.phase !== "answer" || !a.endsAt) {
      delete this.head.dataset.left;
      return;
    }
    this.head.dataset.left = `${Math.max(0, Math.ceil((a.endsAt - serverNow()) / 1000))} s`;
  }
}
