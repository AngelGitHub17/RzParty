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
  el.classList.add("lanes");
  // Les lignes sont gardées d'une mise à jour à l'autre : barres qui glissent, scores qui sautent,
  // et lignes qui changent de place en douceur quand le classement bouge.
  let rowsById = lanesRows.get(el);
  if (!rowsById) {
    clear(el);
    rowsById = new Map();
    lanesRows.set(el, rowsById);
  }
  const best = Math.max(1, opts.max ?? 0, ...players.map((p) => opts.score(p.id)));
  const sorted = [...players].sort((a, b) => opts.score(b.id) - opts.score(a.id));
  const before = new Map([...rowsById].map(([id, r]) => [id, r.row.getBoundingClientRect().top]));
  for (const [id, r] of rowsById) {
    if (!players.some((p) => p.id === id)) {
      r.row.remove();
      rowsById.delete(id);
    }
  }
  for (const p of sorted) {
    const score = opts.score(p.id);
    let r = rowsById.get(p.id);
    if (!r) {
      const fill = h("span", { class: "lanes__fill", style: { width: "0%", background: PLAYER_COLORS[p.color]?.hex } });
      const label = h("strong", { class: "lanes__score" });
      const row = h("li", { class: "lanes__row" }, opts.avatar(p.id, 34), h("span", { class: "lanes__name", text: p.name }), h("span", { class: "lanes__track" }, fill), label);
      r = { row, fill, label, score: null };
      rowsById.set(p.id, r);
    }
    r.row.className = `lanes__row${p.id === opts.me ? " is-me" : ""}${opts.done?.(p.id) ? " is-done" : ""}`;
    const text = opts.label ? opts.label(p.id, score) : String(score);
    if (r.label.textContent !== text) {
      r.label.textContent = text;
      if (r.score !== null && score !== r.score) {
        restartAnimation(r.label, score > r.score ? "is-up" : "is-down");
        if (score > r.score && p.id === opts.me) celebrate(r.label, { count: 8 });
      }
    }
    r.score = score;
    const width = `${(Math.max(0, score) / best) * 100}%`;
    // Première image à 0 %, puis la barre glisse jusqu'à sa valeur.
    if (r.fill.style.width !== width) requestAnimationFrame(() => (r!.fill.style.width = width));
    el.append(r.row);
  }
  // Déplacement en douceur des lignes qui ont changé de place.
  for (const [id, r] of rowsById) {
    const old = before.get(id);
    if (old === undefined) continue;
    const dy = old - r.row.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    r.row.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 380, easing: "cubic-bezier(0.3, 1.3, 0.5, 1)" });
  }
}

const lanesRows = new WeakMap<HTMLElement, Map<string, { row: HTMLElement; fill: HTMLElement; label: HTMLElement; score: number | null }>>();

/** Relance une animation CSS (même si la classe est déjà là). */
export function restartAnimation(el: Element, cls: string): void {
  el.classList.remove("is-up", "is-down", "is-pop", cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/**
 * Petite gerbe de confettis (ou d'étoiles) en HTML, partant d'un élément : pour fêter un bon coup.
 * Ne gêne pas les clics et se nettoie toute seule.
 */
export function celebrate(from: Element, opts: { count?: number; colors?: string[]; symbols?: string[] } = {}): void {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const rect = from.getBoundingClientRect();
  const colors = opts.colors ?? ["#F0483E", "#2F7BEF", "#FFC83D", "#2DB866", "#9257E8"];
  const layer = h("div", { class: "fx-layer", attrs: { "aria-hidden": "true" } });
  document.body.append(layer);
  const count = opts.count ?? 18;
  for (let i = 0; i < count; i++) {
    const symbol = opts.symbols?.[i % opts.symbols.length];
    const bit = h("span", { class: symbol ? "fx-bit is-symbol" : "fx-bit", text: symbol ?? "" });
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const dist = 60 + Math.random() * 90;
    bit.style.left = `${rect.left + rect.width / 2}px`;
    bit.style.top = `${rect.top + rect.height / 2}px`;
    if (!symbol) bit.style.background = colors[i % colors.length]!;
    bit.animate?.(
      [
        { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(1) rotate(${Math.random() * 400}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist * 1.2}px), calc(-50% + ${Math.sin(angle) * dist + 60}px)) scale(0.8) rotate(${Math.random() * 600}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 400, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)", fill: "forwards" },
    );
    layer.append(bit);
  }
  setTimeout(() => layer.remove(), 1500);
}

/**
 * Passe un mini-jeu en 3D : charge sa scène à la demande (la 3D n'alourdit pas le chargement du jeu)
 * et la pose dans `box`. Sans WebGL, ou si la scène échoue, l'affichage 2D reste en place.
 * `create` reçoit le module chargé et l'élément hôte ; elle renvoie false pour abandonner.
 */
export function mount3D<M>(box: HTMLElement, load: () => Promise<M>, create: (mod: M, host: HTMLElement) => boolean): void {
  void (async () => {
    const { webglAvailable } = await import("./three/kit3d.ts");
    if (!webglAvailable()) return;
    const mod = await load();
    const host = h("div", { class: "mg3d" });
    box.classList.add("has-3d");
    box.prepend(host);
    try {
      if (!create(mod, host)) throw new Error("abandon");
    } catch (err) {
      if (!(err instanceof Error && err.message === "abandon")) console.warn("3D indisponible", err);
      host.remove();
      box.classList.remove("has-3d");
    }
  })();
}
