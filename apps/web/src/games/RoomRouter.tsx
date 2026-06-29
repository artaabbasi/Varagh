import { useEffect, useState, type ComponentType } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { RoomView } from "@varagh/shared";
import { socket, setActiveRoom } from "../app/socket";
import { CardLoadingScreen } from "../components/CardLoadingScreen";
import { HokmGame } from "./hokm/HokmGame";
import { PasurGame } from "./pasur/PasurGame";

/**
 * Web game-UI registry — the client-side mirror of the shared `games` registry.
 * Adding a game's UI is one line here; the room route stays game-agnostic.
 */
const GAME_UI: Record<string, ComponentType> = {
  hokm: HokmGame,
  pasur: PasurGame,
};

/**
 * Renders the right game UI for /room/:code based on the room's gameId, with no
 * game-specific branching baked into routing. Owns the active-room registration
 * so a reconnect re-joins this room (see socket.ts); each game component also
 * re-joins on mount to receive its current view.
 */
export function RoomRouter() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setActiveRoom(code);
    const onUpdated = (r: RoomView) => setGameId(r.gameId);
    socket.on("room:updated", onUpdated);
    socket.emit("room:join", { joinCode: code.toUpperCase() }, (res) => {
      if (!res.ok) {
        void navigate("/lobby");
        return;
      }
      setGameId(res.room.gameId);
    });
    return () => {
      socket.off("room:updated", onUpdated);
      setActiveRoom(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!gameId) return <CardLoadingScreen />;
  const Game = GAME_UI[gameId];
  if (!Game) return <CardLoadingScreen />;
  return <Game />;
}
