import { gaussian } from "@rzparty/shared";
import { botSkill, defineMiniGame, rankBy } from "../contract.ts";
import { definition } from "./definition.ts";
import { AUTO_DROP_MS, BASE, FIELD, GIFTS, GIFTS_MS, NEXT_GIFT_MS, dropGift, giftCenter, giftSwing, type CadeauxInput, type CadeauxState } from "./types.ts";

export default defineMiniGame<CadeauxState, null, CadeauxInput>({
  definition,

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state: CadeauxState = { endsAt: 0, towers: {}, finished: false };
    const publish = () => ctx.publish(structuredClone(state));
    const height = (id: string) => state.towers[id]!.blocks.length - 1;
    const topWidth = (id: string) => {
      const b = state.towers[id]!.blocks.at(-1)!;
      return b[1] - b[0];
    };

    /** Lâche le cadeau `t` ms après son apparition. */
    const drop = (id: string, t: number) => {
      const tower = state.towers[id]!;
      if (tower.done || state.finished) return;
      const top = tower.blocks.at(-1)!;
      const res = dropGift(top, giftCenter(tower.gift, t), top[1] - top[0]);
      if (!res) {
        tower.done = true;
        tower.fell = true;
      } else {
        tower.blocks.push(res.block);
        if (res.perfect) tower.perfect++;
        tower.gift++;
        if (tower.gift >= GIFTS) tower.done = true;
        else schedule(id);
      }
      publish();
      if (ids.every((x) => state.towers[x]!.done)) ctx.schedule(1200, end);
    };

    /** Prochain cadeau : il apparaît bientôt et tombe tout seul s'il n'est pas lâché à temps. */
    const schedule = (id: string) => {
      const tower = state.towers[id]!;
      tower.spawnAt = ctx.now() + NEXT_GIFT_MS;
      const gift = tower.gift;
      ctx.schedule(NEXT_GIFT_MS + AUTO_DROP_MS, () => tower.gift === gift && !tower.done && drop(id, AUTO_DROP_MS));
    };

    const end = () => {
      if (state.finished) return;
      state.finished = true;
      for (const id of ids) state.towers[id]!.done = true;
      publish();
      ctx.finish(
        rankBy(ids, (id) => id, (a, b) => height(b) - height(a) || topWidth(b) - topWidth(a)),
        Object.fromEntries(ids.map((id) => [id, { etages: height(id) }])),
      );
    };

    return {
      start() {
        state.endsAt = ctx.now() + GIFTS_MS;
        for (const id of ids) {
          state.towers[id] = { blocks: [[...BASE] as [number, number]], gift: 0, spawnAt: 0, done: false, fell: false, perfect: 0 };
          schedule(id);
        }
        publish();
        ctx.schedule(GIFTS_MS, end);
      },
      input(playerId, raw) {
        const input = raw as Partial<CadeauxInput> | null;
        const tower = state.towers[playerId];
        if (!tower || tower.done || state.finished || !input || input.gift !== tower.gift || typeof input.t !== "number" || !Number.isFinite(input.t)) return;
        const elapsed = ctx.now() - tower.spawnAt;
        if (elapsed < 0 || input.t < 0 || input.t > Math.min(AUTO_DROP_MS, elapsed + 150) || input.t < elapsed - 1500) return;
        drop(playerId, input.t);
      },
    };
  },

  bot(ctx) {
    const skill = botSkill(ctx.profile);
    let planned = -1;
    return {
      onState(state) {
        const tower = state.towers[ctx.player.id];
        if (!tower || tower.done || state.finished || planned === tower.gift) return;
        planned = tower.gift;
        const gift = tower.gift;
        const top = tower.blocks.at(-1)!;
        const target = (top[0] + top[1]) / 2;
        const { period, amp } = giftSwing(gift);
        // Instant où le cadeau passe au-dessus du sommet, après un petit temps de réaction.
        const phase = Math.asin(Math.max(-1, Math.min(1, (target - FIELD / 2) / amp)));
        const candidates: number[] = [];
        for (let n = 0; n < 6; n++) candidates.push(((phase / (2 * Math.PI)) + n) * period, ((0.5 - phase / (2 * Math.PI)) + n) * period);
        const ideal = candidates.filter((t) => t > 700).sort((a, b) => a - b)[0] ?? 1000;
        const err = gaussian(ctx.random, 0, 15 + (1 - skill.accuracy) * 260 + skill.chaos * 60);
        const t = Math.max(100, Math.min(6800, ideal + err));
        const wait = Math.max(0, tower.spawnAt - ctx.now());
        ctx.schedule(wait + t, () => ctx.send({ gift, t: Math.round(t) }));
      },
    };
  },
});
