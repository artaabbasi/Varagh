import { useCallback, useEffect, useState } from "react";
import type { HokmMove, HokmView } from "@varagh/shared";
import type { GameEvent, RoomView } from "@varagh/shared";
import { socket } from "../../../app/socket";

interface UseHokmSocketReturn {
  view: HokmView | null;
  room: RoomView | null;
  events: GameEvent[];
  sendMove: (move: HokmMove) => void;
  moveError: string | null;
  clearMoveError: () => void;
}

export function useHokmSocket(): UseHokmSocketReturn {
  const [view, setView] = useState<HokmView | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    const handleStateUpdate = (data: { view: unknown; events: GameEvent[] }) => {
      setView(data.view as HokmView);
      setEvents(data.events);
    };

    const handleRoomUpdated = (r: RoomView) => {
      setRoom(r);
    };

    socket.on("game:stateUpdate", handleStateUpdate);
    socket.on("room:updated", handleRoomUpdated);

    return () => {
      socket.off("game:stateUpdate", handleStateUpdate);
      socket.off("room:updated", handleRoomUpdated);
    };
  }, []);

  const sendMove = useCallback((move: HokmMove) => {
    setMoveError(null);
    socket.emit("game:move", { move }, (res) => {
      if (!res.ok) {
        setMoveError(res.error);
      }
    });
  }, []);

  const clearMoveError = useCallback(() => setMoveError(null), []);

  return { view, room, events, sendMove, moveError, clearMoveError };
}
