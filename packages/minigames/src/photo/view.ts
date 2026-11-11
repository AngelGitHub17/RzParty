import type { MiniGameView, MiniGameViewContext } from "../client.ts";
import { timingView } from "../timingView.ts";
import { smile, type PhotoParams } from "./logic.ts";

const NS = "http://www.w3.org/2000/svg";
const el = (tag: string, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

/** Le modèle dans le viseur : sa bouche suit la courbe du sourire. */
export function photoView(root: HTMLElement, ctx: MiniGameViewContext): MiniGameView {
  const svg = el("svg", { viewBox: "0 0 640 320" }) as SVGSVGElement;
  svg.append(el("rect", { x: 0, y: 0, width: 640, height: 320, fill: "#ffe3b0" }));
  const face = el("g", { transform: "translate(320 165)" });
  face.append(el("circle", { cx: 0, cy: 0, r: 110, fill: "#f7cba0", stroke: "#1e2a4a", "stroke-width": 5 }));
  const eyeL = el("ellipse", { cx: -40, cy: -25, rx: 12, ry: 14, fill: "#1e2a4a" });
  const eyeR = el("ellipse", { cx: 40, cy: -25, rx: 12, ry: 14, fill: "#1e2a4a" });
  const cheeks = el("g", { opacity: 0 });
  cheeks.append(el("circle", { cx: -70, cy: 20, r: 18, fill: "#f28aa8" }), el("circle", { cx: 70, cy: 20, r: 18, fill: "#f28aa8" }));
  const mouth = el("path", { d: "", fill: "#c0392b", stroke: "#1e2a4a", "stroke-width": 5, "stroke-linejoin": "round" });
  face.append(cheeks, eyeL, eyeR, mouth);
  // Viseur de l'appareil photo.
  const frame = el("g", { stroke: "#fff", "stroke-width": 6, fill: "none", "stroke-linecap": "round" });
  for (const [x, y, dx, dy] of [[150, 30, 1, 1], [490, 30, -1, 1], [150, 290, 1, -1], [490, 290, -1, -1]] as const) {
    frame.append(el("path", { d: `M${x} ${y + dy * 40} L${x} ${y} L${x + dx * 40} ${y}` }));
  }
  const flash = el("rect", { x: 0, y: 0, width: 640, height: 320, fill: "#fff", opacity: 0 });
  svg.append(face, frame, flash);

  return timingView<PhotoParams>(root, ctx, "photo", {
    button: "📸 CLIC",
    instruction: () => "Attends le vrai grand sourire…",
    stage: svg,
    draw(t, p, pressedAt, phase) {
      const at = pressedAt ?? t;
      const s = at === null || phase === "ready" ? 0.1 : smile(at, p) / 100;
      // Bouche : une ligne tordue quand on grimace, un grand croissant ouvert au sourire.
      const w = 40 + 35 * s;
      const curve = -10 + 70 * s;
      const open = 4 + 30 * s * s;
      mouth.setAttribute("d", `M${-w} 40 Q0 ${40 + curve} ${w} 40 Q0 ${40 + curve + open} ${-w} 40 Z`);
      eyeL.setAttribute("ry", String(14 - 8 * s));
      eyeR.setAttribute("ry", String(14 - 8 * s));
      cheeks.setAttribute("opacity", String(s));
      const since = pressedAt !== null && t !== null ? t - pressedAt : Infinity;
      flash.setAttribute("opacity", String(since < 300 ? 1 - since / 300 : 0));
    },
    totalLabel: (n) => `${n} %`,
    scene3d: () => import("./scene3d.ts"),
  });
}
