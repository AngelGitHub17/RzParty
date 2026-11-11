/** Joueurs d'un mini-jeu, prêts pour la 3D (avatar, robot ou non, couleur). */
import { PLAYER_COLORS, normalizeAvatar } from "@rzparty/shared";
import type { MiniGameViewContext } from "../client.ts";
import type { CastPlayer } from "./kit3d.ts";

export function castPlayers(ctx: MiniGameViewContext): CastPlayer[] {
  return ctx.players.map((p) => {
    const data = ctx.avatarData?.(p.id);
    return { id: p.id, avatar: normalizeAvatar(data?.avatar), isBot: data?.isBot ?? p.isBot, color: p.color };
  });
}

export const ringColor = (c: number): string | number => PLAYER_COLORS[c]?.hex ?? 0xffffff;
