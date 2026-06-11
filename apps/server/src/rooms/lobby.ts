import type { Room } from "./room";
import type { LobbyEntry } from "@varagh/shared";

export function toLobbyEntry(room: Room): LobbyEntry {
  const host = room.seats.find((s) => s.playerId === room.hostPlayerId);
  return {
    code: room.code,
    gameId: room.gameId,
    variantId: room.variantId,
    playerCount: room.seats.length,
    hostNickname: host ? `${host.nickname}#${host.discriminator}` : "Unknown",
  };
}
