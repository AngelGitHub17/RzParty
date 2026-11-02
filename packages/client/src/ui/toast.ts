import { h } from "./dom.ts";

let host: HTMLElement | null = null;

/** Message bref en bas de l'écran. `error` le colore en rouge. */
export function toast(message: string, kind: "info" | "error" = "info"): void {
  if (!host) {
    host = h("div", { class: "toasts", attrs: { "aria-live": "polite" } });
    document.body.appendChild(host);
  }
  const el = h("div", { class: `toast toast--${kind}`, text: message });
  host.appendChild(el);
  setTimeout(() => el.classList.add("toast--out"), 3200);
  setTimeout(() => el.remove(), 3600);
}
