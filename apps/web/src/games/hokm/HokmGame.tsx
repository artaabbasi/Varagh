import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { HokmMove, TrickPlay } from "@varagh/shared";
import type { HandOverEventData } from "./hooks/useAnimatedEvents";
import { useHokmSocket } from "./hooks/useHokmSocket";
import { useAnimatedEvents } from "./hooks/useAnimatedEvents";
import { HokmTable } from "./HokmTable";
import { CardLoadingScreen } from "../../components/CardLoadingScreen";
import { TrumpSelector } from "./phases/TrumpSelector";
import { TrumpWaiting } from "./phases/TrumpWaiting";
import { DrawPhase } from "./phases/DrawPhase";
import { HandOverSheet } from "./phases/HandOverSheet";
import { GameOverSheet } from "./phases/GameOverSheet";
import { WaitingRoom } from "./WaitingRoom";
import { TRICK_REVIEW_MS, TRICK_SWEEP_MS } from "./timing";
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

  // Join (or rejoin) the room on mount so direct URL access works.
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
  const [sweepingWinner, setSweepingWinner] = useState<string | null>(null);
  const [reviewingWinner, setReviewingWinner] = useState<string | null>(null);
  const [trumpRevealSuit, setTrumpRevealSuit] = useState<string | null>(null);
  const [kotIsHakem, setKotIsHakem] = useState(false);
  const [showKotBurst, setShowKotBurst] = useState(false);
  const [drawFeedback, setDrawFeedback] = useState<{ playerId: string; action: string } | null>(null);
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

  useAnimatedEvents(events, {
    onCardPlayed: (playerId, card) => {
      const updated = [...currentTrickRef.current, { playerId, card }];
      currentTrickRef.current = updated;
      // Only push to display while no animation is in flight;
      // during review/sweep we keep the completed trick frozen on screen.
      if (!isTrickCompleteRef.current) {
        setDisplayTrick(updated);
      }
    },
    onTrickWon: (winnerId) => {
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
      setTrumpRevealSuit(suit);
      setTimeout(() => setTrumpRevealSuit(null), 2200);
    },
    onHandOver: (data) => {
      // Reset trick tracking for the new hand.
      currentTrickRef.current = [];
      isTrickCompleteRef.current = false;
      setDisplayTrick([]);
      setHandOverData(data);
      setShowHandOver(true);
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

  // Game over takes priority: on the final hand we skip the hand-over
  // countdown entirely and go straight to the results — there is no next round.
  if (view.phase === "gameOver") {
    phaseOverlay = (
      <GameOverSheet
        view={view}
        room={room}
        onRematch={() => {
          /* lobby will handle this */
        }}
      />
    );
  } else if (showHandOver && handOverData) {
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
  } else if (view.phase === "choosingTrump") {
    phaseOverlay = isHakem ? (
      <TrumpSelector
        view={view}
        onChoose={(suit) => handleSendMove({ type: "chooseTrump", suit })}
      />
    ) : (
      <TrumpWaiting view={view} room={room} lang={lang} />
    );
  } else if (view.phase === "drawing") {
    phaseOverlay = (
      <DrawPhase
        view={view}
        room={room}
        drawFeedback={drawFeedback}
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
        onPlay={(card) => handleSendMove({ type: "playCard", card })}
        onClearMoveError={clearMoveError}
      />

      {/* Top controls — exit */}
      {view.phase !== "gameOver" && !confirmLeave && (
        <div className={styles.topControls}>
          <button
            className={styles.exitBtn}
            onClick={() => setConfirmLeave(true)}
            aria-label={t("room.leave.leaveGame")}
            title={t("room.leave.leaveGame")}
          >
            <ExitIcon />
          </button>
        </div>
      )}

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
    </div>
  );
}

function ExitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
