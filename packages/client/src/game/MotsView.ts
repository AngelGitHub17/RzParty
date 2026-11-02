import { PLAYER_COLORS, type MotsState, type RoomSnapshot } from "@rzparty/shared";
import type { ViewLayout } from "@rzparty/minigames/client";
import { clear, h } from "../ui/dom.ts";
import { playerAvatar } from "../ui/avatar.ts";
import { scoreTable, sendAction } from "./modeKit.ts";

/** Mode « Bombe à mots » : la catégorie, qui tient la bombe, le mot proposé et le vote. */
export class MotsView {
  private readonly el: HTMLElement;
  private readonly category = h("div", { class: "words__category" });
  private readonly ring = h("div", { class: "words__ring" });
  private readonly action = h("div", { class: "words__action" });
  private readonly used = h("p", { class: "words__used" });
  private readonly table = h("div", {});
  private input: HTMLInputElement | null = null;
  private draft = "";

  constructor(root: HTMLElement, private readonly layout: ViewLayout, private readonly meId: string | null) {
    this.el = h(
      "section",
      { class: `words words--${layout}` },
      h("div", { class: "words__main" }, this.category, layout === "pad" ? null : this.ring, this.action, this.used),
      layout === "pad" ? null : h("aside", { class: "bv-side" }, this.table),
    );
    root.append(this.el);
  }

  destroy(): void {
    this.el.remove();
  }

  update(room: RoomSnapshot): void {
    const m = room.game?.mots;
    if (!m) return;
    clear(this.category);
    this.category.append(h("small", { text: `Bombe ${m.bomb}/${m.bombs} · catégorie` }), h("strong", { text: m.category }));
    this.renderRing(m, room);
    this.renderAction(m, room);
    this.used.textContent = m.used.length ? `Déjà dit : ${m.used.join(", ")}` : "";
    clear(this.table);
    this.table.append(scoreTable(room.players, Object.keys(m.booms), (id) => m.booms[id] ?? 0, (id) => `💥 ${m.booms[id] ?? 0}`, { meId: this.meId, highlight: m.holder, ascending: true }));
  }

  private renderRing(m: MotsState, room: RoomSnapshot): void {
    clear(this.ring);
    for (const id of Object.keys(m.booms)) {
      const p = room.players.find((x) => x.id === id);
      if (!p) continue;
      const holding = m.holder === id && m.phase === "play";
      const blasted = m.phase === "boom" && m.blast?.playerId === id;
      this.ring.append(
        h(
          "div",
          { class: `words__seat${holding ? ` is-holding heat-${m.heat}` : ""}${blasted ? " is-blasted" : ""}${id === this.meId ? " is-me" : ""}`, style: { "--player": PLAYER_COLORS[p.color]?.hex } },
          playerAvatar(p, { size: this.layout === "tv" ? 64 : 48 }),
          h("span", { class: "words__name", text: p.name }),
          holding ? h("span", { class: "words__bomb", text: "💣" }) : null,
          blasted ? h("span", { class: "words__boom", text: "BOUM !" }) : null,
        ),
      );
    }
  }

  private renderAction(m: MotsState, room: RoomSnapshot): void {
    const holderName = room.players.find((p) => p.id === m.holder)?.name ?? "?";
    // On garde le champ de saisie tel quel pendant qu'on écrit.
    if (this.input && document.activeElement === this.input && m.holder === this.meId && !m.pending && m.phase === "play") return;
    clear(this.action);
    this.input = null;
    if (m.phase === "boom") {
      const victim = room.players.find((p) => p.id === m.blast?.playerId)?.name ?? "?";
      this.action.append(h("p", { class: "words__big", text: m.blast?.playerId === this.meId ? "BOUM ! La bombe t'a explosé dans les mains…" : `BOUM ! ${victim} prend la bombe.` }));
      return;
    }
    if (m.phase !== "play") return;
    if (m.pending) {
      const word = m.pending.spoken ? `${holderName} a dit un mot à voix haute` : `${holderName} propose « ${m.pending.word} »`;
      const votes = Object.entries(m.pending.votes);
      this.action.append(h("p", { class: "words__big", text: word }));
      const canVote = this.layout !== "tv" && this.meId && this.meId !== m.holder && !(this.meId in m.pending.votes);
      if (canVote) {
        this.action.append(
          h(
            "div",
            { class: "words__votes" },
            h("button", { class: "btn btn--go btn--big", attrs: { type: "button" }, text: "✔ Valide", on: { click: () => void sendAction({ type: "vote", ok: true }) } }),
            h("button", { class: "btn btn--big words__no", attrs: { type: "button" }, text: "✘ Refusé", on: { click: () => void sendAction({ type: "vote", ok: false }) } }),
          ),
        );
      }
      this.action.append(
        h(
          "p",
          { class: "muted", text: votes.length ? `Votes : ${votes.map(([id, ok]) => `${room.players.find((p) => p.id === id)?.name ?? "?"} ${ok ? "✔" : "✘"}`).join(" · ")}` : "Les autres votent… (accepté sauf refus de la majorité)" },
        ),
      );
      return;
    }
    if (m.holder === this.meId && this.layout !== "tv") {
      const input = h("input", { class: "words__input", attrs: { type: "text", maxlength: 30, placeholder: `Un mot : ${m.category.toLowerCase()}…`, autocomplete: "off", enterkeyhint: "send" } }) as HTMLInputElement;
      input.value = this.draft;
      input.addEventListener("input", () => (this.draft = input.value));
      const send = async () => {
        if (!input.value.trim()) return;
        if (await sendAction({ type: "word", word: input.value })) this.draft = "";
      };
      input.addEventListener("keydown", (e) => e.key === "Enter" && void send());
      this.input = input;
      this.action.append(
        h("p", { class: "words__big", text: "Tu as la bombe ! Vite, un mot de la catégorie :" }),
        h("div", { class: "words__form" }, input, h("button", { class: "btn btn--go", attrs: { type: "button" }, text: "Envoyer", on: { click: () => void send() } })),
        h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: "🗣️ Je l'ai dit à voix haute", on: { click: () => void sendAction({ type: "word", word: null }) } }),
      );
      return;
    }
    this.action.append(h("p", { class: "words__big", text: `${holderName} a la bombe…` }));
  }
}
