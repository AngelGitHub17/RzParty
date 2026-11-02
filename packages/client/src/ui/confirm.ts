import { h } from "./dom.ts";

/** Demande une confirmation dans la page (jamais de boîte de dialogue du navigateur). */
export function confirmSheet(question: string, action: string, opts: { danger?: boolean; cancel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      sheet.remove();
      window.removeEventListener("keydown", onKey);
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done(false);
    const sheet = h(
      "div",
      { class: "sheet", attrs: { role: "dialog", "aria-modal": "true", "aria-label": question } },
      h(
        "div",
        { class: "panel sheet__card" },
        h("p", { text: question }),
        h(
          "div",
          { class: "sheet__actions" },
          h("button", { class: "btn btn--ghost", attrs: { type: "button" }, text: opts.cancel ?? "Annuler", on: { click: () => done(false) } }),
          h("button", { class: `btn ${opts.danger ? "btn--danger" : "btn--go"}`, attrs: { type: "button" }, text: action, on: { click: () => done(true) } }),
        ),
      ),
    );
    document.body.append(sheet);
    window.addEventListener("keydown", onKey);
  });
}
