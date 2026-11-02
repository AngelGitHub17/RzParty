import "./kit.css";
import { PLAYER_COLORS } from "@rzparty/shared";
type Child = Node | string | number | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
  style?: Partial<Record<string, string>>;
}

/**
 * Crée un élément. Le texte passe toujours par des nœuds texte : un pseudo ne peut jamais
 * injecter de HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const [k, v] of Object.entries(props.style ?? {})) if (v !== undefined) el.style.setProperty(k, v);
  for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn as EventListener);
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** Crée un élément SVG à partir d'un balisage de confiance (généré par notre code, jamais par un joueur). */
export function svg(markup: string): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGSVGElement;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Appelle `fn` à chaque image tant que la vue est montée (minuteurs, barres de temps).
 * Renvoie une fonction d'arrêt.
 */
export function everyFrame(fn: () => void): () => void {
  let id = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    fn();
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => {
    running = false;
    cancelAnimationFrame(id);
  };
}

/** Barre de temps qui se vide jusqu'à `endsAt` (temps serveur). */
export function timeBar(serverNow: () => number): { el: HTMLElement; set(startsAt: number, endsAt: number): void; destroy(): void } {
  const fill = h("div", { class: "timebar__fill" });
  const el = h("div", { class: "timebar", attrs: { role: "presentation" } }, fill);
  let start = 0;
  let end = 0;
  const stop = everyFrame(() => {
    if (!end) return;
    const ratio = Math.max(0, Math.min(1, (end - serverNow()) / Math.max(1, end - start)));
    fill.style.transform = `scaleX(${ratio})`;
    el.classList.toggle("timebar--low", ratio < 0.25);
  });
  return {
    el,
    set(startsAt, endsAt) {
      start = startsAt;
      end = endsAt;
    },
    destroy: stop,
  };
}

/**
 * Pavé numérique tactile (et clavier physique). `onKey` reçoit "0"–"9", "-", "back" ou "ok".
 */
export function keypad(opts: { keys?: string[]; onKey(key: string): void }): { el: HTMLElement; destroy(): void } {
  const keys = opts.keys ?? ["1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "0", "back"];
  const label = (k: string) => (k === "back" ? "⌫" : k === "-" ? "−" : k === "ok" ? "OK" : k);
  const el = h(
    "div",
    { class: "keypad" },
    ...keys.map((k) =>
      h("button", {
        class: `keypad__key${k === "ok" ? " keypad__key--ok" : ""}${k === "back" ? " keypad__key--back" : ""}`,
        attrs: { type: "button", "aria-label": k === "back" ? "Effacer" : k === "ok" ? "Valider" : label(k), "data-key": k },
        text: label(k),
        on: {
          pointerdown: (e) => {
            e.preventDefault();
            opts.onKey(k);
          },
        },
      }),
    ),
  );
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    let key: string | null = null;
    if (/^[0-9]$/.test(e.key)) key = e.key;
    else if (e.key === "-" || e.key === "Subtract") key = "-";
    else if (e.key === "Backspace") key = "back";
    else if (e.key === "Enter") key = "ok";
    if (key === null || (!keys.includes(key) && key !== "ok")) return;
    e.preventDefault();
    opts.onKey(key);
  };
  window.addEventListener("keydown", onKeyDown);
  return { el, destroy: () => window.removeEventListener("keydown", onKeyDown) };
}

/**
 * Tableau des scores en couloirs (écran commun et écran individuel) :
 * avatar, nom, barre de progression à la couleur du joueur, score.
 */
export function scoreLanes(
  el: HTMLElement,
  players: { id: string; name: string; color: number }[],
  opts: {
    score: (id: string) => number;
    max?: number;
    me: string | null;
    avatar: (id: string, size: number) => Element;
    label?: (id: string, score: number) => string;
    done?: (id: string) => boolean;
  },
): void {
  clear(el);
  el.classList.add("lanes");
  const best = Math.max(1, opts.max ?? 0, ...players.map((p) => opts.score(p.id)));
  const rows = [...players].sort((a, b) => opts.score(b.id) - opts.score(a.id));
  for (const p of rows) {
    const score = opts.score(p.id);
    el.append(
      h(
        "li",
        { class: `lanes__row${p.id === opts.me ? " is-me" : ""}${opts.done?.(p.id) ? " is-done" : ""}` },
        opts.avatar(p.id, 34),
        h("span", { class: "lanes__name", text: p.name }),
        h("span", { class: "lanes__track" }, h("span", { class: "lanes__fill", style: { width: `${(Math.max(0, score) / best) * 100}%`, background: PLAYER_COLORS[p.color]?.hex } })),
        h("strong", { class: "lanes__score", text: opts.label ? opts.label(p.id, score) : String(score) }),
      ),
    );
  }
}
