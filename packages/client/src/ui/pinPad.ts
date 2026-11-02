import { h, keypad } from "./dom.ts";

/**
 * Demande un code PIN à 4 chiffres avec un pavé tactile.
 * `onSubmit` lève une erreur si le code est refusé : le message s'affiche et on recommence.
 */
export function openPinPad(opts: { title: string; onSubmit(pin: string): Promise<void> }): void {
  let pin = "";
  let busy = false;
  const dots = h("div", { class: "pin__dots", attrs: { "aria-live": "polite", "aria-label": "Chiffres tapés" } });
  const error = h("p", { class: "form-error", attrs: { role: "alert" } });

  const render = () => {
    dots.replaceChildren(...Array.from({ length: 4 }, (_, i) => h("span", { class: `pin__dot${i < pin.length ? " is-on" : ""}` })));
  };

  const close = () => {
    pad.destroy();
    window.removeEventListener("keydown", onEsc);
    sheet.remove();
  };
  const onEsc = (e: KeyboardEvent) => e.key === "Escape" && close();

  const pad = keypad({
    keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0"],
    onKey(key) {
      if (busy) return;
      if (key === "back") pin = pin.slice(0, -1);
      else if (/^\d$/.test(key) && pin.length < 4) pin += key;
      render();
      if (pin.length === 4) void submit();
    },
  });

  async function submit(): Promise<void> {
    busy = true;
    try {
      await opts.onSubmit(pin);
      close();
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : "Code refusé.";
      dots.classList.remove("shake");
      void dots.offsetWidth;
      dots.classList.add("shake");
      pin = "";
      render();
    } finally {
      busy = false;
    }
  }

  const sheet = h(
    "div",
    { class: "sheet", attrs: { role: "dialog", "aria-modal": "true", "aria-label": opts.title } },
    h(
      "div",
      { class: "panel sheet__card pin" },
      h("p", { class: "pin__title", text: opts.title }),
      dots,
      error,
      pad.el,
      h("button", { class: "btn btn--ghost btn--small", attrs: { type: "button" }, text: "Annuler", on: { click: close } }),
    ),
  );
  render();
  document.body.append(sheet);
  window.addEventListener("keydown", onEsc);
}
