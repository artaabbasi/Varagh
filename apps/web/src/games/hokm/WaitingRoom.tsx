import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { RoomView } from "@varagh/shared";
import { socket } from "../../app/socket";
import { getStoredUser } from "../../auth/auth-store";
import styles from "./WaitingRoom.module.css";

interface WaitingRoomProps {
  room: RoomView;
}

function minPlayersForVariant(variantId: string): number {
  // variantId may be "hokm-4p", "hokm-3p", "hokm-2p" or plain "4p" etc.
  const match = /(\d+)p$/.exec(variantId);
  return match ? parseInt(match[1], 10) : 2;
}

function shortVariantKey(variantId: string): "4p" | "3p" | "2p" {
  const match = /(\d+)p$/.exec(variantId);
  const n = match?.[1];
  if (n === "4" || n === "3" || n === "2") return `${n}p` as "4p" | "3p" | "2p";
  return "4p";
}

export function WaitingRoom({ room }: WaitingRoomProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = getStoredUser();

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isHost = room.seats.some(
    (s) => s.playerId === user?.id && s.isHost,
  );
  const minPlayers = minPlayersForVariant(room.variantId);
  const canStart = isHost && room.seats.length >= minPlayers;

  const handleStart = () => {
    setStarting(true);
    setStartError(null);
    socket.emit("game:start", {}, (res) => {
      setStarting(false);
      if (!res.ok) {
        setStartError(res.error);
      }
    });
  };

  const handleLeave = () => {
    socket.emit("room:leave", {}, () => {
      void navigate("/lobby");
    });
  };

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.logo} aria-label="Varagh">ورق</span>
          <span className={styles.gameLabel}>Hokm · حکم · {t(`lobby.variants.${shortVariantKey(room.variantId)}`)}</span>
        </div>

        <h1 className={styles.title}>{t("room.waiting.title")}</h1>

        {/* Join code */}
        <div className={styles.codeSection}>
          <span className={styles.codeLabel}>{t("room.waiting.codeLabel")}</span>
          <div className={styles.codeRow}>
            <span className={styles.code}>{room.code}</span>
            <button
              className={styles.copyBtn}
              onClick={handleCopyCode}
              aria-label={t("room.waiting.copyCode")}
            >
              {copied ? t("room.waiting.copied") : t("room.waiting.copyCode")}
            </button>
          </div>
        </div>

        {/* Player list */}
        <div className={styles.playersSection}>
          <span className={styles.sectionLabel}>{t("room.waiting.playersLabel")}</span>
          <ul className={styles.playerList} aria-label={t("room.waiting.playersLabel")}>
            {room.seats.map((seat) => (
              <li key={seat.playerId} className={styles.playerItem}>
                <div className={styles.avatar} aria-hidden="true">
                  {seat.nickname.slice(0, 1).toUpperCase()}
                </div>
                <div className={styles.playerInfo}>
                  <span className={styles.playerName}>
                    {seat.nickname}
                    <span className={styles.playerDisc}>#{seat.discriminator}</span>
                    {seat.playerId === user?.id && (
                      <span className={styles.youBadge}>{t("hokm.you")}</span>
                    )}
                  </span>
                  {seat.isHost && (
                    <span className={styles.hostBadge}>
                      <HostIcon />
                      {t("lobby.hostLabel")}
                    </span>
                  )}
                </div>
                <div
                  className={`${styles.statusDot} ${seat.connected ? styles.connected : styles.disconnected}`}
                  aria-label={seat.connected ? "Online" : "Offline"}
                />
              </li>
            ))}

            {/* Empty seat placeholders */}
            {Array.from({ length: Math.max(0, minPlayers - room.seats.length) }).map((_, i) => (
              <li key={`empty-${i}`} className={`${styles.playerItem} ${styles.emptySlot}`}>
                <div className={`${styles.avatar} ${styles.emptyAvatar}`} aria-hidden="true">?</div>
                <span className={styles.emptyLabel}>
                  {t("room.waiting.startHint", { min: minPlayers })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Start / wait hint */}
        {startError && (
          <p className={styles.error} role="alert">{startError}</p>
        )}

        {isHost ? (
          <button
            className={styles.startBtn}
            onClick={handleStart}
            disabled={!canStart || starting}
          >
            {starting ? "…" : t("room.waiting.startGame")}
          </button>
        ) : (
          <p className={styles.waitHint}>{t("room.waiting.waitHint")}</p>
        )}

        <button className={styles.leaveBtn} onClick={handleLeave}>
          {t("room.waiting.leave")}
        </button>
      </div>
    </div>
  );
}

function HostIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
