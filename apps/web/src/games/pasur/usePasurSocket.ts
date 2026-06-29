import { useCallback, useEffect, useState } from "react";
import type { GameEvent, PasurMove, PasurView, RoomView } from "@varagh/shared";
import { socket } from "../../app/socket";

interface UsePasurSocketReturn {
  view: PasurView | null;
  room: RoomView | null;
  events: GameEvent[];
  sendMove: (move: PasurMove) => void;
  moveError: string | null;
  clearMoveError: () => void;
}

/** Mirrors useHokmSocket: subscribes to the per-player view + room updates. */
export function usePasurSocket(): UsePasurSocketReturn {
  const [view, setView] = useState<PasurView | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    const handleStateUpdate = (data: { view: unknown; events: GameEvent[] }) => {
      setView(data.view as PasurView);
      setEvents(data.events);
    };
    const handleRoomUpdated = (r: RoomView) => setRoom(r);

    socket.on("game:stateUpdate", handleStateUpdate);
    socket.on("room:updated", handleRoomUpdated);
    return () => {
      socket.off("game:stateUpdate", handleStateUpdate);
      socket.off("room:updated", handleRoomUpdated);
    };
  }, []);

  const sendMove = useCallback((move: PasurMove) => {
    setMoveError(null);
    socket.emit("game:move", { move }, (res) => {
      if (!res.ok) setMoveError(res.error);
    });
  }, []);

  const clearMoveError = useCallback(() => setMoveError(null), []);

  return { view, room, events, sendMove, moveError, clearMoveError };
}
