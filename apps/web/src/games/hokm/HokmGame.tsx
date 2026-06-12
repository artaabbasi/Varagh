import { useState, useCallback, useEffect } from "react";
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
import { socket } from "../../app/socket";
import styles from "./HokmGame.module.css";

export function HokmGame() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { view, room, events, sendMove, moveError, clearMoveError } = useHokmSocket();

  // Join (or rejoin) the room on mount so direct URL access works.
  useEffect(() => {
    if (!code) return;
    socket.emit("room:join", { joinCode: code.toUpperCase() }, (res) => {
      if (!res.ok) void navigate("/lobby");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Animation / overlay state ─────────────────────────────────
  const [showHandOver, setShowHandOver] = useState(false);
  const [handOverData, setHandOverData] = useState<HandOverEventData | null>(null);
  const [sweepingWinner, setSweepingWinner] = useState<string | null>(null);
  const [trumpRevealSuit, setTrumpRevealSuit] = useState<string | null>(null);
  const [kotIsHakem, setKotIsHakem] = useState(false);
  const [showKotBurst, setShowKotBurst] = useState(false);
  const [drawFeedback, setDrawFeedback] = useState<{ playerId: string; action: string } | null>(null);

  useAnimatedEvents(events, {
    onTrickWon: (winnerId) => {
      setSweepingWinner(winnerId);
      setTimeout(() => setSweepingWinner(null), 900);
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

  // Room is in pre-game lobby — show waiting room UI.
  if (room?.phase === "lobby") {
    return <WaitingRoom room={room} />;
  }

  if (!view) {
    return (
      <div className={styles.loading} aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p>{t("hokm.loading")}</p>
      </div>
    );
  }

  const localPlayer = view.forPlayer;
  const isHakem = view.players[view.hakemIndex] === localPlayer;
  const lang = i18n.language as "fa" | "en";

  // ── Phase overlay ─────────────────────────────────────────────
  let phaseOverlay: React.ReactNode = null;

  if (showHandOver && handOverData) {
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
  } else if (view.phase === "gameOver") {
    phaseOverlay = (
      <GameOverSheet
        view={view}
        room={room}
        onRematch={() => {
          /* lobby will handle this */
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
      {phaseOverlay && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          {phaseOverlay}
        </div>
      )}
    </div>
  );
}
