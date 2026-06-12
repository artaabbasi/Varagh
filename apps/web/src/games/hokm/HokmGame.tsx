import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { HokmMove } from "@varagh/shared";
import type { HandOverEventData } from "./hooks/useAnimatedEvents";
import { useHokmSocket } from "./hooks/useHokmSocket";
import { useAnimatedEvents } from "./hooks/useAnimatedEvents";
import { HokmTable } from "./HokmTable";
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
  const [confirmEnd, setConfirmEnd] = useState(false);
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
  const [trumpRevealSuit, setTrumpRevealSuit] = useState<string | null>(null);
  const [kotIsHakem, setKotIsHakem] = useState(false);
  const [showKotBurst, setShowKotBurst] = useState(false);
  const [drawFeedback, setDrawFeedback] = useState<{ playerId: string; action: string } | null>(null);
  const sweepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = sweepTimersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  useAnimatedEvents(events, {
    onTrickWon: (winnerId) => {
      // Hold the completed trick in the centre (review), THEN sweep it to the
      // winner. The point is revealed by HokmTable as the sweep lands.
      setSweepingWinner(null);
      const reviewTimer = setTimeout(() => {
        setSweepingWinner(winnerId);
        const sweepTimer = setTimeout(() => setSweepingWinner(null), TRICK_SWEEP_MS);
        sweepTimersRef.current.push(sweepTimer);
      }, TRICK_REVIEW_MS);
      sweepTimersRef.current.push(reviewTimer);
    },
    onTrumpChosen: (suit) => {
      setTrumpRevealSuit(suit);
      setTimeout(() => setTrumpRevealSuit(null), 2200);
    },
    onHandOver: (data) => {
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

  // Host deliberately ends the match for everyone, then returns to lobby.
  const handleEndGameConfirmed = () => {
    socket.emit("room:endGame", {}, () => {
      goToLobby();
    });
  };

  // Room is in pre-game lobby — show waiting room UI.
  if (room?.phase === "lobby") {
    return <WaitingRoom room={room} />;
  }

  if (!view) {
    return (
      <div className={styles.loading} aria-live="polite">
        <div className={styles.loadingCards} aria-hidden="true">
          <span className={styles.loadingCard} data-suit="spades">♠</span>
          <span className={styles.loadingCard} data-suit="hearts">♥</span>
          <span className={styles.loadingCard} data-suit="diamonds">♦</span>
          <span className={styles.loadingCard} data-suit="clubs">♣</span>
        </div>
        <p>{t("hokm.loading")}</p>
      </div>
    );
  }

  const localPlayer = view.forPlayer;
  const isHakem = view.players[view.hakemIndex] === localPlayer;
  const isHost = room?.seats.find((s) => s.playerId === localPlayer)?.isHost ?? false;
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
        sweepingWinner={sweepingWinner}
        trumpRevealSuit={trumpRevealSuit}
        showKotBurst={showKotBurst}
        moveError={moveError}
        onPlay={(card) => handleSendMove({ type: "playCard", card })}
        onClearMoveError={clearMoveError}
      />

      {/* Top controls — exit (everyone) + end game (host only) */}
      {view.phase !== "gameOver" && !confirmLeave && !confirmEnd && (
        <div className={styles.topControls}>
          <button
            className={styles.exitBtn}
            onClick={() => setConfirmLeave(true)}
            aria-label={t("room.leave.leaveGame")}
            title={t("room.leave.leaveGame")}
          >
            <ExitIcon />
          </button>
          {isHost && (
            <button
              className={styles.endGameBtn}
              onClick={() => setConfirmEnd(true)}
            >
              {t("hokm.endGame.button")}
            </button>
          )}
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

      {/* Host end-game confirmation dialog */}
      {confirmEnd && (
        <div className={styles.leaveOverlay} role="alertdialog" aria-modal="true">
          <div className={styles.leaveDialog}>
            <p className={styles.leaveDialogTitle}>{t("hokm.endGame.confirm")}</p>
            <p className={styles.leaveDialogSub}>{t("hokm.endGame.confirmSub")}</p>
            <div className={styles.leaveDialogActions}>
              <button className={styles.leaveCancelBtn} onClick={() => setConfirmEnd(false)}>
                {t("room.leave.cancel")}
              </button>
              <button className={styles.leaveConfirmBtn} onClick={handleEndGameConfirmed}>
                {t("hokm.endGame.button")}
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
