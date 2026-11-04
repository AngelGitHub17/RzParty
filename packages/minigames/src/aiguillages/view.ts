import "../timing.css";
import "./style.css";
import { PLAYER_COLORS } from "@rzparty/shared";
import { clear, h, scoreLanes, svg, timeBar } from "../kit.ts";
import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { localStart } from "../timing.ts";
import { EXITS, STATIONS, SWITCHES, TRAIN_CHOOSE_MS, exitOf, type AiguillagesState, type Path } from "./types.ts";

const LEAF_X = 400;
const ST_X = 590;
const leafY = (i: number) => 28 + i * 38;
const nodeX = (level: number) => 50 + level * 116;
/** Ordonnée d'un aiguillage : au milieu des sorties qu'il dessert. */
const nodeY = (level: number, index: number) => {
  const span = EXITS / 2 ** level;
  return (leafY(index * span) + leafY(index * span + span - 1)) / 2;
};

/** Les rails d'un chemin (partiel ou complet), en segments [x1, y1, x2, y2]. */
function segments(path: Path, wiring: number[]): string {
  let d = `M10 ${nodeY(0, 0)} L${nodeX(0)} ${nodeY(0, 0)}`;
  let index = 0;
  path.forEach((b, level) => {
    const next = index * 2 + b;
    const x2 = level + 1 < SWITCHES ? nodeX(level + 1) : LEAF_X;
    const y2 = level + 1 < SWITCHES ? nodeY(level + 1, next) : leafY(next);
    d += ` L${x2} ${y2}`;
    index = next;
  });
  if (path.length === SWITCHES) {
    const leaf = exitOf(path);
    const y1 = leafY(leaf);
    const y2 = leafY(wiring[leaf]!);
    d += ` C${LEAF_X + 90} ${y1} ${ST_X - 110} ${y2} ${ST_X - 22} ${y2}`;
  }
  return d;
}

function allRails(wiring: number[]): string {
  let out = "";
  const walk = (prefix: Path) => {
    if (prefix.length === SWITCHES) {
      out += `<path d="${segments(prefix, wiring)}"/>`;
      return;
    }
    walk([...prefix, 0]);
    walk([...prefix, 1]);
  };
  walk([]);
  return out;
}

/** « Aiguillages » : suivre les rails des yeux et régler les aiguillages. */
export function aiguillagesView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const interactive = ctx.layout !== "tv" && ctx.me !== null;
  let state: AiguillagesState | null = null;
  let picks: Path = [];
  let sentRound = 0;
  let start = 0;
  let startedRound = 0;
  let drawnRound = -1;

  const title = h("p", { class: "tm__title", attrs: { "aria-live": "polite" } });
  const bar = timeBar(ctx.serverNow);
  const map = svg(`<svg viewBox="0 0 640 330" class="rail__map" role="img" aria-label="Plan des rails"></svg>`);
  const up = h("button", { class: "pen__btn rail__btn", attrs: { type: "button" }, text: "▲ En haut", on: { pointerdown: (e) => (e.preventDefault(), pick(0)) } });
  const down = h("button", { class: "pen__btn rail__btn", attrs: { type: "button" }, text: "▼ En bas", on: { pointerdown: (e) => (e.preventDefault(), pick(1)) } });
  const undo = h("button", { class: "btn btn--ghost btn--small", attrs: { type: "button" }, text: "↺ Recommencer", on: { click: () => ((picks = []), draw()) } });
  const status = h("p", { class: "rail__status" });
  const results = h("ul", { class: "tm__results" });
  const lanes = h("ol", {});
  root.append(
    h(
      "div",
      { class: `mg tm rail rail--${ctx.layout}` },
      bar.el,
      title,
      h("div", { class: "tm__stage rail__stage" }, map),
      interactive ? h("div", { class: "rail__pad" }, up, down) : null,
      interactive ? h("div", { class: "rail__tools" }, status, undo) : null,
      results,
      ctx.layout === "pad" ? null : lanes,
    ),
  );
  const onKey = (e: KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === "ArrowUp" || e.key === "z" || e.key === "w") (e.preventDefault(), pick(0));
    else if (e.key === "ArrowDown" || e.key === "s") (e.preventDefault(), pick(1));
    else if (e.key === "Backspace") (e.preventDefault(), (picks = []), draw());
  };
  window.addEventListener("keydown", onKey);

  function pick(b: 0 | 1): void {
    const s = state;
    if (!s || s.phase !== "choose" || sentRound === s.round || picks.length >= SWITCHES) return;
    picks = [...picks, b];
    if (picks.length === SWITCHES) {
      sentRound = s.round;
      ctx.send({ round: s.round, path: picks, t: Math.round(performance.now() - start) });
    }
    draw();
  }

  const myColor = PLAYER_COLORS[ctx.players.find((p) => p.id === ctx.me)?.color ?? 0]?.hex ?? "#2db866";

  function draw(): void {
    const s = state;
    if (!s || !s.wiring.length) return;
    const hidden = s.phase === "ready";
    const stations = STATIONS.slice(0, EXITS)
      .map((st, i) => {
        const y = leafY(i);
        const target = i === s.target;
        return `<g transform="translate(${ST_X} ${y})" class="${target ? "rail__target" : ""}">
          <circle r="17" fill="${target ? "#ffc83d" : "#ffffff"}" stroke="${target ? "#d99a0b" : "#d6e6f5"}" stroke-width="3"/>
          <text y="7" text-anchor="middle" font-size="19">${st.icon}</text></g>`;
      })
      .join("");
    const switches = Array.from({ length: SWITCHES }, (_, level) =>
      Array.from({ length: 2 ** level }, (_, i) => `<circle cx="${nodeX(level)}" cy="${nodeY(level, i)}" r="${picks.length === level && level === 0 ? 9 : 7}" fill="#56627f"/>`).join(""),
    ).join("");
    const correct = s.wiring.indexOf(s.target);
    const correctPath = Array.from({ length: SWITCHES }, (_, i) => ((correct >> (SWITCHES - 1 - i)) & 1) as 0 | 1);
    const mine = ctx.me && s.results?.[ctx.me]?.path ? s.results[ctx.me]!.path! : picks;
    map.innerHTML = `<rect width="640" height="330" rx="0" fill="#f4fbff"/>
      <g fill="none" stroke="#b9c6d6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="${hidden ? 0.25 : 1}">${allRails(s.wiring)}</g>
      ${mine.length ? `<path d="${segments(mine, s.wiring)}" fill="none" stroke="${myColor}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      ${s.phase === "result" ? `<path d="${segments(correctPath, s.wiring)}" fill="none" stroke="#2db866" stroke-width="5" stroke-dasharray="10 8" stroke-linecap="round"/>` : ""}
      ${switches}
      <g transform="translate(14 ${nodeY(0, 0)})"><rect x="-12" y="-12" width="30" height="24" rx="6" fill="#f0483e"/><circle cx="-4" cy="14" r="4" fill="#1e2a4a"/><circle cx="10" cy="14" r="4" fill="#1e2a4a"/></g>
      ${stations}`;
    if (interactive) {
      const done = state && sentRound === s.round;
      up.disabled = down.disabled = s.phase !== "choose" || Boolean(done);
      undo.disabled = s.phase !== "choose" || Boolean(done) || !picks.length;
      status.textContent = s.phase !== "choose" ? "" : done ? "Réponse envoyée !" : `Aiguillage ${picks.length + 1} sur ${SWITCHES}`;
    }
  }

  function render(): void {
    const s = state;
    if (!s) return;
    if (drawnRound !== s.round) {
      drawnRound = s.round;
      picks = [];
    }
    if (s.phase === "choose" && startedRound !== s.round) {
      startedRound = s.round;
      start = localStart(s.startedAt, ctx.serverNow);
    }
    if (s.phase === "choose") bar.set(s.startedAt, s.startedAt + TRAIN_CHOOSE_MS);
    const target = STATIONS[s.target]!;
    title.textContent = s.phase === "done" ? "Terminé !" : `Train ${s.round}/${s.rounds} · Direction ${target.icon} ${target.name}`;
    draw();
    clear(results);
    if (s.phase === "result" && s.results) {
      for (const p of ctx.players) {
        const r = s.results[p.id];
        if (!r) continue;
        const text = r.ok ? (r.fastest ? `★ ${(r.time! / 1000).toFixed(1)} s` : `${(r.time! / 1000).toFixed(1)} s`) : r.path ? "Mauvaise gare" : "Trop tard";
        results.append(h("li", { class: r.fastest ? "is-best" : "", style: { "--player": PLAYER_COLORS[p.color]?.hex } }, ctx.avatar(p.id, 26), h("strong", { text })));
      }
    } else if (s.phase === "choose" && ctx.layout !== "pad") {
      for (const id of s.answered) results.append(h("li", {}, ctx.avatar(id, 26), h("strong", { text: "a répondu" })));
    }
    if (ctx.layout !== "pad") scoreLanes(lanes, ctx.players, { score: (id) => s.scores[id] ?? 0, me: ctx.me, avatar: ctx.avatar, label: (_, n) => `${n} pt${n > 1 ? "s" : ""}` });
  }

  return {
    update(next) {
      state = next as AiguillagesState;
      render();
    },
    destroy() {
      bar.destroy();
      window.removeEventListener("keydown", onKey);
    },
  };
}
