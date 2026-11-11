import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import { tremplinScore, type TremplinParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** Tremplin vu de côté : le skieur glisse en accélérant, puis s'envole (ou tombe). */
export function tremplinView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 640 300" }) as SVGSVGElement;
  const A = { x: 30, y: 50 };
  const B = { x: 300, y: 200 };
  svg.append(
    el("rect", { x: 0, y: 0, width: 640, height: 300, fill: "#cdebff" }),
    el("path", { d: "M300 200 Q 470 220 640 290 L640 300 L0 300 L0 230 Q150 230 300 200", fill: "#f4fbff" }),
    el("path", { d: `M${A.x} ${A.y} L${B.x} ${B.y} L${B.x} ${B.y + 14} L${A.x} ${A.y + 14} Z`, fill: "#9a6542" }),
    el("rect", { x: B.x - 6, y: B.y - 6, width: 10, height: 30, fill: "#f0483e" }),
  );
  // Repères de distance sur la piste d'atterrissage.
  for (let m = 60; m <= 140; m += 20) {
    const x = 300 + (m - 40) * 3.1;
    const y = 200 + ((x - 300) / 340) * 70 + 8;
    const label = el("text", { x, y: y + 22, "font-size": 14, "font-weight": 700, fill: "#56627f", "text-anchor": "middle" });
    label.textContent = `${m}`;
    svg.append(el("line", { x1: x, y1: y, x2: x, y2: y + 8, stroke: "#56627f", "stroke-width": 2 }), label);
  }
  const skier = el("g", {});
  skier.append(el("rect", { x: -16, y: 6, width: 32, height: 4, rx: 2, fill: "#1e2a4a" }), el("circle", { cx: 0, cy: -8, r: 12, fill: "#f0483e" }), el("circle", { cx: 0, cy: -24, r: 8, fill: "#f7cba0" }));
  svg.append(skier);
  const place = (x: number, y: number, rot: number) => skier.setAttribute("transform", `translate(${x} ${y}) rotate(${rot})`);
  const slope = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;

  return timingView<TremplinParams>(root, ctx, "tremplin", {
    button: "SAUTER",
    instruction: () => "Saute au dernier moment !",
    stage: svg,
    draw(t, p, pressedAt, phase, spectator) {
      if (t === null || phase === "ready") return place(A.x, A.y, slope);
      // Écran commun pendant la manche : le skieur s'arrête au bout du tremplin (chacun saute de son côté).
      if (spectator && pressedAt === null) {
        const along = Math.min(1, Math.pow(Math.min(t, p.ramp) / p.ramp, 2));
        return place(A.x + (B.x - A.x) * along, A.y + (B.y - A.y) * along, slope);
      }
      const jumpAt = pressedAt ?? t;
      const along = Math.min(1, Math.pow(Math.min(jumpAt, p.ramp) / p.ramp, 2));
      const sx = A.x + (B.x - A.x) * along;
      const sy = A.y + (B.y - A.y) * along;
      if (pressedAt === null && t <= p.ramp) return place(sx, sy, slope);
      const score = tremplinScore(pressedAt, p);
      const flight = Math.min(1, (t - Math.min(jumpAt, p.ramp)) / 1100);
      if (score === 0) {
        // Chute : le skieur dégringole au bout du tremplin.
        return place(B.x + flight * 60, B.y + flight * 80, 180 * flight + slope);
      }
      const landX = 300 + (score - 40) * 3.1;
      const landY = 200 + ((landX - 300) / 340) * 70;
      const x = sx + (landX - sx) * flight;
      const y = sy + (landY - sy) * flight - Math.sin(Math.PI * flight) * (40 + score * 0.6);
      place(x, y, 10 - 20 * flight);
    },
    totalLabel: (n) => `${n} m`,
    scene3d: () => import("./scene3d.ts"),
  });
}
