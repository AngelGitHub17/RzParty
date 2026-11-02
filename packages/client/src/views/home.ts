import { isValidRoomCode, normalizeRoomCode } from "@rzparty/shared";
import { h } from "../ui/dom.ts";
import { wordmark } from "../ui/brand.ts";
import { pawn } from "../ui/avatar.ts";
import type { View } from "../main.ts";

/** Page d'accueil : choisir comment on joue, ou rejoindre avec un code. */
export const homeView: View = (root, { navigate }) => {
  const codeInput = h("input", {
    class: "input input--code",
    attrs: { name: "code", maxlength: 4, autocomplete: "off", autocapitalize: "characters", spellcheck: "false", placeholder: "ABCD", "aria-label": "Code du salon" },
  });
  const error = h("p", { class: "form-error", attrs: { role: "alert" } });

  const join = h(
    "form",
    {
      class: "join-inline",
      on: {
        submit: (e) => {
          e.preventDefault();
          const code = normalizeRoomCode(codeInput.value);
          if (!isValidRoomCode(code)) {
            error.textContent = "Le code fait 4 lettres, par exemple KPRT.";
            codeInput.focus();
            return;
          }
          navigate(`/jouer?code=${code}`);
        },
      },
    },
    h("label", { text: "Une partie t'attend ? Entre son code", attrs: { for: "home-code" } }),
    h("div", { class: "join-inline__row" }, codeInput, h("button", { class: "btn btn--go", attrs: { type: "submit" }, text: "Rejoindre" })),
    error,
  );
  codeInput.id = "home-code";

  const choice = (href: string, title: string, body: string, art: Node) =>
    h(
      "a",
      { class: "choice", attrs: { href }, on: { click: (e) => (e.preventDefault(), navigate(href)) } },
      h("div", { class: "choice__art" }, art),
      h("strong", { class: "choice__title", text: title }),
      h("span", { class: "choice__body", text: body }),
    );

  const trio = h("div", { class: "trio" }, pawn(1, { size: 64 }), pawn(0, { size: 84 }), pawn(3, { size: 64 }));
  const solo = h("div", { class: "trio" }, pawn(4, { size: 64 }), pawn(5, { size: 64 }));

  root.append(
    h(
      "main",
      { class: "home" },
      h("header", { class: "home__head" }, wordmark("big"), h("p", { class: "home__tag", text: "Le jeu de société à plusieurs, sur le réseau de la maison." })),
      h(
        "div",
        { class: "home__choices" },
        choice("/ecran", "Un écran pour tout le monde", "La télé ou le PC du salon affiche le jeu. Chacun joue avec son téléphone.", trio),
        choice("/jouer", "Chacun son écran", "Chaque joueur voit la partie sur son ordinateur ou sa tablette.", solo),
      ),
      join,
      h("a", {
        class: "home__host",
        attrs: { href: "/hote" },
        text: "Gérer les profils (sur le PC hôte)",
        on: { click: (e) => (e.preventDefault(), navigate("/hote")) },
      }),
    ),
  );
  return () => {};
};
