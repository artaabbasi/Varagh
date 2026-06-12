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
  className?: string;
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

export function ScorePanel({ view, room, className }: ScorePanelProps) {
  const { t } = useTranslation();
  const { players, scores, tricksTaken, hakemIndex } = view;
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
    </div>
  );
}
