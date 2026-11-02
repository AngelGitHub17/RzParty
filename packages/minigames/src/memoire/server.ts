import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, type MiniGameRanking } from "../contract.ts";
import { definition } from "./definition.ts";
import {
  COLORS,
  MEMO_MAX_LEVEL,
  SHAPES,
  alphabet,
  inputDuration,
  levelSetup,
  showDuration,
  type MemoInput,
  type MemoState,
} from "./types.ts";

export default defineMiniGame<MemoState, never, MemoInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: MemoState = {
      level: 0,
      variant: "couleurs",
      length: 0,
      phase: "show",
      items: null,
      holed: null,
      choices: null,
      missing: null,
      phaseEndsAt: 0,
      status: Object.fromEntries(ids.map((id) => [id, "en-jeu"])),
      lastCheck: {},
    };
    let solution: string[] = [];
    let row: string[] = [];
    const answers = new Map<string, { items: string[]; at: number }>();
    /** Pour départager les éliminés : niveau atteint, bonnes réponses au début, heure d'envoi. */
    const out = new Map<string, { level: number; prefix: number; at: number }>();

    const publish = () => ctx.publish(structuredClone(state));
    const alive = () => ids.filter((id) => state.status[id] !== "elimine");
    const pickFrom = <T,>(list: readonly T[]) => list[Math.floor(ctx.random() * list.length)]!;

    function prepareLevel() {
      const { variant, length } = levelSetup(state.level);
      state.variant = variant;
      state.length = length;
      state.holed = null;
      state.choices = null;
      state.missing = null;
      if (variant === "disparu") {
        // Une rangée d'objets tous différents (forme + couleur), dont un va disparaître.
        const pool = SHAPES.flatMap((s) => COLORS.map((c) => `${s}:${c}`));
        const shuffled = [...pool].sort(() => ctx.random() - 0.5);
        row = shuffled.slice(0, length);
        const hole = Math.floor(ctx.random() * length);
        const missing = row[hole]!;
        // Les leurres ne sont jamais dans la rangée : sinon on devinerait par élimination.
        const decoys = shuffled.slice(length, length + 3);
        state.choices = [missing, ...decoys].sort(() => ctx.random() - 0.5);
        state.holed = row.map((item, i) => (i === hole ? null : item));
        solution = [missing];
        state.items = row;
      } else {
        const keys = alphabet(variant);
        solution = Array.from({ length }, () => pickFrom(keys));
        state.items = solution;
      }
    }

    function nextLevel() {
      state.level++;
      prepareLevel();
      answers.clear();
      for (const id of alive()) state.status[id] = "en-jeu";
      state.phase = "show";
      state.lastCheck = {};
      state.phaseEndsAt = ctx.now() + showDuration(state.length);
      // Pendant la saisie, la rangée « disparu » reste visible mais mélangée avec un trou.
      const visibleDuringInput = state.holed;
      state.holed = null;
      publish();
      const level = state.level;
      ctx.schedule(showDuration(state.length), () => {
        if (state.level !== level) return;
        state.phase = "input";
        state.items = null;
        state.holed = visibleDuringInput;
        state.phaseEndsAt = ctx.now() + inputDuration(state.length);
        publish();
        ctx.schedule(inputDuration(state.length), () => state.level === level && state.phase === "input" && check());
      });
    }

    function check() {
      state.phase = "check";
      state.items = state.variant === "disparu" ? row : solution;
      state.missing = state.variant === "disparu" ? solution[0]! : null;
      const now = ctx.now();
      for (const id of alive()) {
        const a = answers.get(id);
        const ok = a !== undefined && a.items.length === solution.length && a.items.every((x, i) => x === solution[i]);
        state.lastCheck[id] = ok;
        if (!ok) {
          let prefix = 0;
          while (a && prefix < solution.length && a.items[prefix] === solution[prefix]) prefix++;
          out.set(id, { level: state.level, prefix, at: a?.at ?? now });
        }
      }
      const survivors = alive().filter((id) => state.lastCheck[id]);
      for (const id of alive()) if (!state.lastCheck[id]) state.status[id] = "elimine";
      state.phaseEndsAt = now + 2800;
      publish();

      const over = survivors.length <= 1 || state.level >= MEMO_MAX_LEVEL;
      ctx.schedule(2800, () => {
        if (!over) return nextLevel();
        state.phase = "done";
        publish();
        // Niveau réussi : celui du dernier contrôle pour les survivants, le précédent pour les éliminés.
        const records = Object.fromEntries(
          ids.map((id) => [id, { niveau: survivors.includes(id) ? state.level : Math.max(0, (out.get(id)?.level ?? 1) - 1) }]),
        );
        ctx.finish(ranking(survivors), records);
      });
    }

    function ranking(survivors: string[]): MiniGameRanking {
      const groups: MiniGameRanking = survivors.length ? [survivors] : [];
      const eliminated = [...out.entries()].sort(([, a], [, b]) => b.level - a.level || b.prefix - a.prefix || a.at - b.at);
      let previous: { level: number; prefix: number; at: number } | undefined;
      for (const [id, r] of eliminated) {
        if (previous && previous.level === r.level && previous.prefix === r.prefix && previous.at === r.at) groups.at(-1)!.push(id);
        else groups.push([id]);
        previous = r;
      }
      return groups;
    }

    return {
      start: nextLevel,
      input(playerId, raw) {
        const input = raw as Partial<MemoInput> | null;
        if (state.phase !== "input" || state.status[playerId] !== "en-jeu" || !input || !Array.isArray(input.items)) return;
        const allowed = state.variant === "disparu" ? (state.choices ?? []) : alphabet(state.variant);
        const items = input.items.filter((x): x is string => typeof x === "string");
        if (items.length !== solution.length || items.length !== input.items.length || !items.every((x) => allowed.includes(x))) return;
        answers.set(playerId, { items, at: ctx.now() });
        state.status[playerId] = "envoye";
        publish();
        if (alive().every((id) => state.status[id] === "envoye")) ctx.schedule(400, () => state.phase === "input" && check());
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    // Capacité de mémoire : environ 5 éléments pour un bot facile, 8 pour un bot difficile.
    const capacity = 2.5 + 6 * skill.accuracy;
    let seen: string[] = [];
    let answeredLevel = 0;
    return {
      onState(state) {
        if (state.phase === "show" && state.items) seen = state.items;
        if (state.phase !== "input" || state.status[ctx.player.id] !== "en-jeu" || answeredLevel === state.level) return;
        answeredLevel = state.level;
        const remembers = state.length <= capacity + gaussian(ctx.random, 0, 0.8 + skill.chaos * 2);
        let items: string[];
        if (state.variant === "disparu") {
          const choices = state.choices ?? [];
          const missing = choices.find((c) => seen.includes(c) && !(state.holed ?? []).includes(c));
          const wrong = choices.filter((c) => c !== missing);
          items = [remembers && missing ? missing : (wrong[Math.floor(ctx.random() * wrong.length)] ?? choices[0]!)];
        } else {
          items = [...seen];
          if (!remembers && items.length) {
            const keys = alphabet(state.variant);
            const at = Math.floor(ctx.random() * items.length);
            const others = keys.filter((k) => k !== items[at]);
            items[at] = others[Math.floor(ctx.random() * others.length)]!;
          }
        }
        const delay = Math.max(900, (1200 + state.length * 420) / skill.speed + gaussian(ctx.random, 0, 300));
        ctx.schedule(delay, () => ctx.send({ items }));
      },
    };
  },
});
