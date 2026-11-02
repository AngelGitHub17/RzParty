import { type QuizState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, everyFrame, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { serverNow } from "./clock.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

const OPTION_COLORS = ["#2F7BEF", "#F0483E", "#2DB866", "#F2B705"];

/** Mode « Quiz entre amis » : la question, les 4 réponses, les paris révélés. */
export class QuizView {
  private readonly el: HTMLElement;
  private readonly head = h("div", { class: "quiz__head" });
  private readonly question = h("h2", { class: "quiz__question" });
  private readonly hint = h("p", { class: "quiz__hint" });
  private readonly options = h("div", { class: "quiz__options" });
  private readonly table = h("div", {});
  private room: RoomSnapshot | null = null;
  private chosen = -1;
  private round = 0;
  private stop: () => void;

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `quiz quiz--${layout}` },
      h("div", { class: "quiz__main" }, this.head, this.question, this.hint, this.options),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
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
    const q = room.game?.quiz;
    if (!q) return;
    if (q.round !== this.round) {
      this.round = q.round;
      this.chosen = -1;
    }
    const star = room.players.find((p) => p.id === q.star);
    clear(this.head);
    this.head.append(h("small", { text: `Question ${q.round}/${q.rounds}` }));
    if (star) this.head.append(playerAvatar(star, { size: 44 }));
    this.head.append(h("strong", { text: star ? `Question pour ${star.name}` : "" }));
    this.question.textContent = q.question.text;
    const iAmStar = this.meId === q.star;
    const canAnswer = this.layout !== "tv" && this.meId !== null && q.phase === "answer" && !q.answered.includes(this.meId);
    clear(this.options);
    q.question.options.forEach((text, i) => {
      const guessers = q.guesses ? Object.entries(q.guesses).filter(([, g]) => g === i).map(([id]) => id) : [];
      const right = q.phase === "reveal" && q.starAnswer === i;
      this.options.append(
        h(
          canAnswer ? "button" : "div",
          {
            class: `quiz__option${this.chosen === i ? " is-chosen" : ""}${right ? " is-right" : ""}${q.phase === "reveal" && !right ? " is-dim" : ""}`,
            style: { "--opt": OPTION_COLORS[i] },
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
          h("strong", { text: text }),
          q.phase === "reveal"
            ? h(
                "span",
                { class: "quiz__guessers" },
                ...guessers.flatMap((id) => {
                  const p = room.players.find((x) => x.id === id);
                  return p ? [playerAvatar(p, { size: 26 })] : [];
                }),
              )
            : null,
        ),
      );
    });
    clear(this.table);
    const ids = Object.keys(q.scores);
    this.table.append(scoreTable(room.players, ids, (id) => q.scores[id] ?? 0, (id) => `${q.scores[id] ?? 0} pt${(q.scores[id] ?? 0) > 1 ? "s" : ""}`, { meId: this.meId, highlight: q.star }));
    this.renderHint(q, iAmStar, star?.name ?? "?");
  }

  private renderHint(q: QuizState, iAmStar: boolean, starName: string): void {
    const answered = q.answered.length;
    const total = Object.keys(q.scores).length;
    if (q.phase === "reveal") {
      const right = q.guesses ? Object.values(q.guesses).filter((g) => g === q.starAnswer).length : 0;
      this.hint.textContent = q.starAnswer === null ? `${starName} n'a pas répondu…` : `${right} ami${right > 1 ? "s" : ""} l'${right > 1 ? "ont" : "a"} bien deviné !`;
      return;
    }
    if (this.layout === "tv" || !this.meId) {
      this.hint.textContent = `${answered}/${total} ont répondu`;
      return;
    }
    if (this.meId && q.answered.includes(this.meId)) this.hint.textContent = `Réponse envoyée ! (${answered}/${total})`;
    else this.hint.textContent = iAmStar ? "Réponds sincèrement, en secret : les autres doivent deviner !" : `Que va répondre ${starName} ?`;
  }

  private tick(): void {
    const q = this.room?.game?.quiz;
    if (!q || q.phase !== "answer" || !q.endsAt) return;
    const left = Math.max(0, Math.ceil((q.endsAt - serverNow()) / 1000));
    this.head.dataset.left = `${left} s`;
  }
}
