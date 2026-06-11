import { useTranslation } from "react-i18next";
import type { HokmView } from "@varagh/shared";
import type { RoomView } from "@varagh/shared";
import styles from "./ScorePanel.module.css";

function getNickname(room: RoomView | null, playerId: string) {
  return room?.seats.find((s) => s.playerId === playerId)?.nickname ?? "?";
}

interface ScorePanelProps {
  view: HokmView;
  room: RoomView | null;
  className?: string;
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
          {view.trump && (
            <span
              className={[
                styles.trumpSuit,
                view.trump === "hearts" || view.trump === "diamonds"
                  ? styles.red
                  : styles.black,
              ].join(" ")}
            >
              {SUIT_SYMBOL[view.trump]}
            </span>
          )}
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
        {view.trump && (
          <span
            className={[
              styles.trumpSuit,
              view.trump === "hearts" || view.trump === "diamonds"
                ? styles.red
                : styles.black,
            ].join(" ")}
          >
            {SUIT_SYMBOL[view.trump]}
          </span>
        )}
      </div>
    </div>
  );
}

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};
