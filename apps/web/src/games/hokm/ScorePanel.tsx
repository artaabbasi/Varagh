import { useTranslation } from "react-i18next";
import type { HokmView } from "@varagh/shared";
import type { RoomView } from "@varagh/shared";
import styles from "./ScorePanel.module.css";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function getNickname(room: RoomView | null, playerId: string) {
  return room?.seats.find((s) => s.playerId === playerId)?.nickname ?? "?";
}

interface ScorePanelProps {
  view: HokmView;
  room: RoomView | null;
  /** Trick counts to display; defaults to view.tricksTaken. Lets the table
   *  delay the count so the point lands in time with the sweep animation. */
  tricksOverride?: [number, number];
  onLeave?: () => void;
  className?: string;
}

function ExitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function TrumpBadge({ trump, t }: { trump: string; t: (k: string) => string }) {
  const isRed = trump === "hearts" || trump === "diamonds";
  return (
    <div
      className={styles.trumpBadge}
      aria-label={`${t("hokm.trump")}: ${t(`hokm.suits.${trump}`)}`}
    >
      <span className={styles.trumpBadgeLabel}>{t("hokm.trump")}</span>
      <span className={[styles.trumpBadgeSuit, isRed ? styles.red : styles.black].join(" ")}>
        {SUIT_SYMBOL[trump]}
      </span>
      <span className={[styles.trumpBadgeName, isRed ? styles.red : styles.black].join(" ")}>
        {t(`hokm.suits.${trump}`)}
      </span>
    </div>
  );
}

export function ScorePanel({ view, room, tricksOverride, onLeave, className }: ScorePanelProps) {
  const { t } = useTranslation();
  const { players, scores, hakemIndex } = view;
  const tricksTaken = tricksOverride ?? view.tricksTaken;
  const numPlayers = players.length;

  if (numPlayers === 4) {
    return (
      <div className={[styles.panel, className].filter(Boolean).join(" ")}>
        <div className={styles.teamScore}>
          <span className={styles.teamDot} data-team="primary" />
          <span className={styles.trickCount}>{tricksTaken[0]}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.gameScore}>{scores[0]}</span>
          <span className={styles.label}>{t("hokm.score")}</span>
        </div>
        <div className={styles.trumpDisplay}>
          {view.trump
            ? <TrumpBadge trump={view.trump} t={t} />
            : <span className={styles.trumpUnknown}>?</span>}
        </div>
        <div className={styles.teamScore}>
          <span className={styles.teamDot} data-team="tertiary" />
          <span className={styles.trickCount}>{tricksTaken[1]}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.gameScore}>{scores[1]}</span>
          <span className={styles.label}>{t("hokm.score")}</span>
        </div>
        {onLeave && (
          <button className={styles.exitBtn} onClick={onLeave} aria-label={t("room.leave.leaveGame")}>
            <ExitIcon />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={[styles.panel, styles.panelMulti, className].filter(Boolean).join(" ")}>
      {players.map((p, i) => (
        <div key={p} className={styles.playerScore}>
          <span className={styles.nickname}>{getNickname(room, p)}</span>
          {i === hakemIndex && <span className={styles.hakemBadge}>★</span>}
          <span className={styles.gameScore}>{scores[i]}</span>
        </div>
      ))}
      <div className={styles.trumpDisplay}>
        {view.trump
          ? <TrumpBadge trump={view.trump} t={t} />
          : <span className={styles.trumpUnknown}>?</span>}
      </div>
      {onLeave && (
        <button className={styles.exitBtn} onClick={onLeave} aria-label={t("room.leave.leaveGame")}>
          <ExitIcon />
        </button>
      )}
    </div>
  );
}
