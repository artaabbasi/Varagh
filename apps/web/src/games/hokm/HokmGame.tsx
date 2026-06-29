import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { HokmMove, TrickPlay, Card } from "@varagh/shared";
import type { HandOverEventData } from "./hooks/useAnimatedEvents";
import { useHokmSocket } from "./hooks/useHokmSocket";
import { useAnimatedEvents } from "./hooks/useAnimatedEvents";
import { playSound } from "../../app/sound";
import { HokmTable } from "./HokmTable";
import { StickerWheel } from "./StickerWheel";
import { CardLoadingScreen } from "../../components/CardLoadingScreen";
import { TrumpSelector } from "./phases/TrumpSelector";
import { TrumpWaiting } from "./phases/TrumpWaiting";
import { TrumpReveal } from "./phases/TrumpReveal";
import { DrawPhase } from "./phases/DrawPhase";
import { HandOverSheet } from "./phases/HandOverSheet";
import { GameOverSheet } from "./phases/GameOverSheet";
import { WaitingRoom } from "./WaitingRoom";
import { TRICK_REVIEW_MS, TRICK_SWEEP_MS, TRICK_HOLD_MS } from "./timing";
import { socket } from "../../app/socket";
import styles from "./HokmGame.module.css";

export function HokmGame() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { view, room, events, sendMove, moveError, clearMoveError } = useHokmSocket();

  const [confirmLeave, setConfirmLeave] = useState(false);
  // null while the game is running; set once it has been ended early.
  const [ended, setEnded] = useState<{ reason: "playerLeft" | "hostEnded"; by: string | null } | null>(null);

  // Re-join on mount so the server re-pushes our current view after our socket
  // listeners are wired (RoomRouter owns the active-room registration that
  // drives auto-reconnect). Direct-URL access works because RoomRouter joined
  // first to resolve the gameId.
  useEffect(() => {
    if (!code) return;
    socket.emit("room:join", { joinCode: code.toUpperCase() }, (res) => {
      if (!res.ok) void navigate("/lobby");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // The game was ended early (a player left, or the host ended it).
  useEffect(() => {
    const onAborted = (data: { reason: "playerLeft" | "hostEnded"; by: string | null }) => {
      setEnded({ reason: data.reason, by: data.by });
    };
    socket.on("game:aborted", onAborted);
    return () => { socket.off("game:aborted", onAborted); };
  }, []);

  // Leave our seat behind on the way out so the finished room is cleaned up.
  const goToLobby = () => {
    socket.emit("room:leave", {}, () => { void navigate("/lobby"); });
  };

  // Warn on accidental page close / tab close during a live game.
  useEffect(() => {
    if (!view || view.phase === "gameOver") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [view]);

  // ── Animation / overlay state ─────────────────────────────────
  const [showHandOver, setShowHandOver] = useState(false);
  const [handOverData, setHandOverData] = useState<HandOverEventData | null>(null);
  // Game-over sheet is held back until the final trick has reviewed + swept.
  const [showGameOver, setShowGameOver] = useState(false);
  // True between a hand ending and its summary appearing: suppresses the
  // next-hand trump/draw overlays so the last trick can sweep uninterrupted.
  const [pendingHandEnd, setPendingHandEnd] = useState(false);
  const [sweepingWinner, setSweepingWinner] = useState<string | null>(null);
  const [reviewingWinner, setReviewingWinner] = useState<string | null>(null);
  const [trumpRevealSuit, setTrumpRevealSuit] = useState<string | null>(null);
  const [kotIsHakem, setKotIsHakem] = useState(false);
  const [showKotBurst, setShowKotBurst] = useState(false);
  const [drawFeedback, setDrawFeedback] = useState<{ playerId: string; action: string } | null>(null);
  // 2p: what you just took / burned during the draw (private reveal panel).
  const [drawReveal, setDrawReveal] = useState<{ earned: Card; burned: Card | null; kept: boolean } | null>(null);
  const drawRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stickers currently floating over each seat: playerId → { id, nonce }.
  const [stickers, setStickers] = useState<Record<string, { id: string; nonce: number }>>({});
  const stickerNonceRef = useRef(0);
  const stickerTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sweepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Trick display (event-driven, not state-driven) ────────────
  // currentTrickRef accumulates cards as they are played.
  // isTrickCompleteRef gates display updates during the review/sweep animation
  // so the completed trick stays visible until the sweep finishes.
  const currentTrickRef = useRef<TrickPlay[]>([]);
  const isTrickCompleteRef = useRef(false);
  const [displayTrick, setDisplayTrick] = useState<TrickPlay[]>([]);

  useEffect(() => {
    const timers = sweepTimersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  // Incoming stickers from anyone in the room (including our own echo).
  useEffect(() => {
    const onSticker = ({ from, stickerId }: { from: string; stickerId: string }) => {
      const nonce = ++stickerNonceRef.current;
      setStickers((prev) => ({ ...prev, [from]: { id: stickerId, nonce } }));
      playSound("sticker");
      if (stickerTimersRef.current[from]) clearTimeout(stickerTimersRef.current[from]);
      stickerTimersRef.current[from] = setTimeout(() => {
        setStickers((prev) => {
          // Only clear if this exact sticker is still the active one.
          if (prev[from]?.nonce !== nonce) return prev;
          const next = { ...prev };
          delete next[from];
          return next;
        });
      }, 4000);
    };
    socket.on("room:sticker", onSticker);
    const timers = stickerTimersRef.current;
    return () => {
      socket.off("room:sticker", onSticker);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Reveal the game-over sheet only after the final trick has had time to
  // review + sweep. Also covers reconnecting into an already-finished game.
  useEffect(() => {
    if (view?.phase !== "gameOver") { setShowGameOver(false); return; }
    const id = setTimeout(() => setShowGameOver(true), TRICK_HOLD_MS);
    return () => clearTimeout(id);
  }, [view?.phase]);

  useAnimatedEvents(events, {
    onCardPlayed: (playerId, card) => {
      playSound("playCard");
      const updated = [...currentTrickRef.current, { playerId, card }];
      currentTrickRef.current = updated;
      // Only push to display while no animation is in flight;
      // during review/sweep we keep the completed trick frozen on screen.
      if (!isTrickCompleteRef.current) {
        setDisplayTrick(updated);
      }
    },
    onTrickWon: (winnerId) => {
      playSound("trickWin");
      // Lock display so new cards from the next trick don't overwrite
      // the completed trick during review/sweep.
      isTrickCompleteRef.current = true;
      currentTrickRef.current = []; // ready for next trick's accumulation
      // Phase 1 — REVIEW: all cards visible, winner highlighted + ring.
      // Phase 2 — SWEEP:  cards fly to winner's seat.
      // Phase 3 — CLEAR:  trick area empties, trick count ticks up.
      setSweepingWinner(null);
      setReviewingWinner(winnerId);
      const reviewTimer = setTimeout(() => {
        setReviewingWinner(null);
        setSweepingWinner(winnerId);
        const sweepTimer = setTimeout(() => {
          setSweepingWinner(null);
          isTrickCompleteRef.current = false;
          // Flush any cards that arrived during animation, or clear.
          if (currentTrickRef.current.length > 0) {
            setDisplayTrick([...currentTrickRef.current]);
          } else {
            setDisplayTrick([]);
          }
        }, TRICK_SWEEP_MS);
        sweepTimersRef.current.push(sweepTimer);
      }, TRICK_REVIEW_MS);
      sweepTimersRef.current.push(reviewTimer);
    },
    onTrumpChosen: (suit) => {
      playSound("trumpChosen");
      setTrumpRevealSuit(suit);
      setTimeout(() => setTrumpRevealSuit(null), 2200);
    },
    onHandOver: (data) => {
      // Hold the summary back until the final trick has reviewed + swept, so
      // the deciding card is actually seen (the engine has already dealt the
      // next hand, so we also gate the next-hand overlays until then).
      setHandOverData(data);
      setPendingHandEnd(true);
      const id = setTimeout(() => {
        setShowHandOver(true);
        setPendingHandEnd(false);
      }, TRICK_HOLD_MS);
      sweepTimersRef.current.push(id);
    },
    onKot: (isHakemKot) => {
      setKotIsHakem(isHakemKot);
      setShowKotBurst(true);
      setTimeout(() => setShowKotBurst(false), 1800);
    },
    onDrawAction: (playerId, action) => {
      setDrawFeedback({ playerId, action });
      setTimeout(() => setDrawFeedback(null), 2000);
    },
    onGameOver: () => {
      playSound("gameWin");
    },
    onCardDrawn: (card, kept) => {
      playSound("cardDraw");
      setDrawReveal({ earned: card, burned: null, kept });
      if (drawRevealTimerRef.current) clearTimeout(drawRevealTimerRef.current);
      drawRevealTimerRef.current = setTimeout(() => setDrawReveal(null), 3500);
    },
    onCardBurned: (card) => {
      // Arrives in the same event batch right after cardDrawn — attach to it.
      setDrawReveal((prev) => (prev ? { ...prev, burned: card } : prev));
    },
  });

  const handleSendMove = useCallback(
    (move: HokmMove) => {
      clearMoveError();
      sendMove(move);
    },
    [sendMove, clearMoveError],
  );

  const handleLeaveConfirmed = () => {
    socket.emit("room:leave", {}, () => {
      void navigate("/lobby");
    });
  };

  // Room is in pre-game lobby — show waiting room UI.
  if (room?.phase === "lobby") {
    return <WaitingRoom room={room} />;
  }

  if (!view) {
    return <CardLoadingScreen />;
  }

  const localPlayer = view.forPlayer;
  const isHakem = view.players[view.hakemIndex] === localPlayer;
  const lang = i18n.language as "fa" | "en";

  // ── Phase overlay ─────────────────────────────────────────────
  let phaseOverlay: React.ReactNode = null;

  // Game over takes priority, but only once the final trick has swept (so the
  // deciding card is actually seen before the results appear).
  if (view.phase === "gameOver" && showGameOver) {
    phaseOverlay = (
      <GameOverSheet
        view={view}
        room={room}
        onRematch={() => {
          // Reset the room to its lobby; the room:updated broadcast flips
          // everyone still here back to the waiting room.
          socket.emit("room:rematch", {}, () => {});
        }}
      />
    );
  } else if (showHandOver && handOverData && view.phase !== "gameOver") {
    phaseOverlay = (
      <HandOverSheet
        data={handOverData}
        view={view}
        room={room}
        kotIsHakem={kotIsHakem}
        onContinue={() => {
          setShowHandOver(false);
          setHandOverData(null);
        }}
      />
    );
  } else if (view.phase === "choosingTrump" && !pendingHandEnd) {
    phaseOverlay = isHakem ? (
      <TrumpSelector
        view={view}
        onChoose={(suit) => handleSendMove({ type: "chooseTrump", suit })}
      />
    ) : (
      <TrumpWaiting view={view} room={room} lang={lang} />
    );
  } else if (view.phase === "drawing" && !pendingHandEnd) {
    phaseOverlay = (
      <DrawPhase
        view={view}
        room={room}
        drawFeedback={drawFeedback}
        lastDraw={drawReveal}
        onKeep={() => handleSendMove({ type: "keepCard" })}
        onReject={() => handleSendMove({ type: "rejectCard" })}
      />
    );
  }

  return (
    <div className={styles.root}>
      <HokmTable
        view={view}
        room={room}
        trickOverride={displayTrick}
        sweepingWinner={sweepingWinner}
        reviewingWinner={reviewingWinner}
        trumpRevealSuit={trumpRevealSuit}
        showKotBurst={showKotBurst}
        moveError={moveError}
        stickers={stickers}
        onPlay={(card) => handleSendMove({ type: "playCard", card })}
        onClearMoveError={clearMoveError}
        onLeave={view.phase !== "gameOver" && !confirmLeave ? () => setConfirmLeave(true) : undefined}
      />

      {/* Sticker chat — available whenever the table is up. */}
      {view.phase !== "gameOver" && <StickerWheel />}

      {/* Leave confirmation dialog */}
      {confirmLeave && (
        <div className={styles.leaveOverlay} role="alertdialog" aria-modal="true">
          <div className={styles.leaveDialog}>
            <p className={styles.leaveDialogTitle}>{t("room.leave.confirm")}</p>
            <p className={styles.leaveDialogSub}>{t("room.leave.gameWillPause")}</p>
            <div className={styles.leaveDialogActions}>
              <button className={styles.leaveCancelBtn} onClick={() => setConfirmLeave(false)}>
                {t("room.leave.cancel")}
              </button>
              <button className={styles.leaveConfirmBtn} onClick={handleLeaveConfirmed}>
                {t("room.leave.leaveGame")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game ended early (a player left, or the host ended it) */}
      {ended && (
        <div className={styles.leaveOverlay} role="alertdialog" aria-modal="true">
          <div className={styles.leaveDialog}>
            <p className={styles.leaveDialogTitle}>{t("hokm.aborted.title")}</p>
            <p className={styles.leaveDialogSub}>
              {ended.reason === "hostEnded"
                ? t("hokm.aborted.descHost")
                : ended.by
                  ? t("hokm.aborted.descBy", { name: ended.by })
                  : t("hokm.aborted.desc")}
            </p>
            <div className={styles.leaveDialogActions}>
              <button className={styles.toLobbyBtn} onClick={goToLobby}>
                {t("hokm.aborted.toLobby")}
              </button>
            </div>
          </div>
        </div>
      )}

      {phaseOverlay && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          {phaseOverlay}
        </div>
      )}

      {/* Trump announcement — pops up briefly right after the Hakem picks. */}
      <TrumpReveal
        suit={trumpRevealSuit}
        hakemName={
          room?.seats.find((s) => s.playerId === view.players[view.hakemIndex])?.nickname ??
          undefined
        }
      />
    </div>
  );
}

