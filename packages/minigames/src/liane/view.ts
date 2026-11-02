import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import { lianeScore, swing, type LianeParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** La liane au-dessus de la rivière, la rive d'arrivée à droite. */
export function lianeView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 640 320" }) as SVGSVGElement;
  const P = { x: 170, y: 20 };
  const L = 190;
  svg.append(
    el("rect", { x: 0, y: 0, width: 640, height: 320, fill: "#cdebff" }),
    el("rect", { x: 0, y: 250, width: 640, height: 70, fill: "#2f7bef" }),
    el("path", { d: "M0 250 L120 250 L140 320 L0 320 Z", fill: "#7ed957" }),
    el("path", { d: "M360 250 L640 250 L640 320 L345 320 Z", fill: "#7ed957" }),
    el("rect", { x: 80, y: 10, width: 200, height: 14, rx: 7, fill: "#6b4423" }),
  );
  for (let m = 20; m <= 100; m += 20) {
    const x = 360 + (m - 15) * 3.2;
    const label = el("text", { x, y: 290, "font-size": 14, "font-weight": 700, fill: "#1e5a26", "text-anchor": "middle" });
    label.textContent = `${m}`;
    svg.append(label);
  }
  const rope = el("line", { x1: P.x, y1: P.y, x2: P.x, y2: P.y + L, stroke: "#3fae49", "stroke-width": 5, "stroke-linecap": "round" });
  const hero = el("g", {});
  hero.append(el("circle", { cx: 0, cy: 0, r: 15, fill: "#ff8a1f" }), el("circle", { cx: 0, cy: -20, r: 10, fill: "#f7cba0" }));
  svg.append(rope, hero);
  const end = (angle: number) => ({ x: P.x + Math.sin(angle) * L, y: P.y + Math.cos(angle) * L });

  return timingView<LianeParams>(root, ctx, "liane", {
    button: "LÂCHER",
    instruction: () => "Lâche quand la liane part vers l'avant !",
    stage: svg,
    draw(t, p, pressedAt, phase) {
      const angle = t === null || phase === "ready" ? 0 : swing(pressedAt ?? t, p).angle;
      const ropeAngle = t === null || phase === "ready" ? 0 : swing(t, p).angle;
      const r = end(ropeAngle);
      rope.setAttribute("x2", String(r.x));
      rope.setAttribute("y2", String(r.y));
      if (pressedAt === null || t === null) {
        const h = end(angle);
        hero.setAttribute("transform", `translate(${h.x} ${h.y + 15})`);
        return;
      }
      const from = end(angle);
      const score = lianeScore(pressedAt, p);
      const flight = Math.min(1, (t - pressedAt) / 1000);
      const landX = score ? 360 + (score - 15) * 3.2 : from.x + 40;
      const landY = score ? 235 : 265;
      const x = from.x + (landX - from.x) * flight;
      const y = from.y + (landY - from.y) * flight - Math.sin(Math.PI * flight) * score * 0.9;
      hero.setAttribute("transform", `translate(${x} ${y + 15})`);
    },
    totalLabel: (n) => `${n} m`,
  });
}
