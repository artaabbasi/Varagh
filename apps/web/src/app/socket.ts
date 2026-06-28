import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@varagh/shared";
import { getStoredToken, clearToken, storeUser } from "../auth/auth-store";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(SERVER_URL, {
  autoConnect: false,
}) as Socket<ServerToClientEvents, ClientToServerEvents>;

// ── Auto-reconnect / re-join ────────────────────────────────────────────────
// socket.io transparently re-establishes the underlying connection after a
// network drop or the PWA waking from background — but each new connection is
// a fresh, unauthenticated socket on the server. So on EVERY (re)connection we
// re-authenticate with the stored token and re-join the room the player is in,
// which recovers a live game without the player having to reload the page.

/** Room the player is actively seated in; re-joined automatically on reconnect. */
let activeRoomCode: string | null = null;

export function setActiveRoom(code: string | null): void {
  activeRoomCode = code ? code.toUpperCase() : null;
}

socket.on("connect", () => {
  const token = getStoredToken();
  if (!token) return;
  socket.emit("auth:login", { token }, (res) => {
    if (!res.ok) {
      clearToken();
      return;
    }
    storeUser(res.user);
    // Re-take our seat so the server pushes us the current game view.
    if (activeRoomCode) {
      socket.emit("room:join", { joinCode: activeRoomCode }, () => {});
    }
  });
});
