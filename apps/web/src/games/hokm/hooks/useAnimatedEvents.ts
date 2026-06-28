import { useEffect, useRef } from "react";
import type { GameEvent } from "@varagh/shared";
import type { Card } from "@varagh/shared";

export interface AnimationCallbacks {
  onCardPlayed?: (playerId: string, card: Card) => void;
  onTrickWon?: (winnerId: string) => void;
  onTrumpChosen?: (suit: string) => void;
  onHandOver?: (data: HandOverEventData) => void;
  onKot?: (isHakemKot: boolean) => void;
  onGameOver?: () => void;
  onDrawAction?: (playerId: string, action: "kept" | "rejected") => void;
  /** 2p: the card YOU just took (private). `kept` distinguishes keep vs. blind pass. */
  onCardDrawn?: (card: Card, kept: boolean) => void;
  /** 2p, optional setting: the card YOU just burned (private). */
  onCardBurned?: (card: Card, kept: boolean) => void;
}

export interface HandOverEventData {
  /** Per-slot trick counts: length 2 (4p teams / 2p seats) or 3 (3p seats). */
  tricksTaken: number[];
  /** The slot (team for 4p, seat for 2p/3p) that won the hand. */
  winnerSlot: number;
  /** Points the winning slot gained this hand. */
  points: number;
  scores: number[];
}

export function useAnimatedEvents(
  events: GameEvent[],
  callbacks: AnimationCallbacks,
) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const lastEventsRef = useRef<GameEvent[]>([]);

  useEffect(() => {
    if (events === lastEventsRef.current || events.length === 0) return;
    lastEventsRef.current = events;

    for (const event of events) {
      const cb = callbacksRef.current;

      switch (event.type) {
        case "cardPlayed": {
          const d = event.data as { playerId: string; card: Card };
          cb.onCardPlayed?.(d.playerId, d.card);
          break;
        }
        case "trickWon": {
          const d = event.data as { winnerId: string };
          cb.onTrickWon?.(d.winnerId);
          break;
        }
        case "trumpChosen": {
          const d = event.data as { suit: string };
          cb.onTrumpChosen?.(d.suit);
          break;
        }
        case "handOver": {
          cb.onHandOver?.(event.data as HandOverEventData);
          break;
        }
        case "hakemKot": {
          cb.onKot?.(true);
          break;
        }
        case "kot": {
          cb.onKot?.(false);
          break;
        }
        case "gameOver": {
          cb.onGameOver?.();
          break;
        }
        case "drawAction": {
          const d = event.data as { playerId: string; action: "kept" | "rejected" };
          cb.onDrawAction?.(d.playerId, d.action);
          break;
        }
        case "cardDrawn": {
          const d = event.data as { card: Card; kept: boolean };
          cb.onCardDrawn?.(d.card, d.kept);
          break;
        }
        case "cardBurned": {
          const d = event.data as { card: Card; kept: boolean };
          cb.onCardBurned?.(d.card, d.kept);
          break;
        }
      }
    }
  }, [events]);
}
