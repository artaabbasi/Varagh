import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { HokmView, RoomView } from "@varagh/shared";
import { socket } from "../../../app/socket";
import styles from "./GameOverSheet.module.css";

interface GameOverSheetProps {
  view: HokmView;
  room: RoomView | null;
  onRematch: () => void;
}

export function GameOverSheet({ view, room, onRematch }: GameOverSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const numPlayers = view.players.length;
  const [rematchRequested, setRematchRequested] = useState(false);

  const maxScore = Math.max(...view.scores);
  const winnerIndices = view.scores
    .map((s, i) => (s >= maxScore ? i : -1))
    .filter((i) => i >= 0);

  const getNick = (pid: string) =>
    room?.seats.find((s) => s.playerId === pid)?.nickname ?? pid.slice(0, 8);

  let winnerLabel: string;
  let winnerNames: string | null = null;

  if (numPlayers === 4) {
    const winningTeamIdx = winnerIndices[0] % 2; // 0 = team1 (seats 0,2), 1 = team2 (seats 1,3)
    winnerLabel = t("hokm.gameOver.teamWins", {
      name: t("hokm.team", { n: winningTeamIdx === 0 ? 1 : 2 }),
    });
    winnerNames = [winningTeamIdx, winningTeamIdx + 2]
      .map((i) => getNick(view.players[i]))
      .join(" & ");
  } else {
    winnerLabel = t("hokm.gameOver.winner", {
      name: getNick(view.players[winnerIndices[0]]),
    });
  }

  const scoreRows =
    numPlayers === 4
      ? [0, 1].map((teamIdx) => ({
          label: t("hokm.team", { n: teamIdx + 1 }),
          sublabel: [teamIdx, teamIdx + 2].map((i) => getNick(view.players[i])).join(" & "),
          score: view.scores[teamIdx],
          isWinner: winnerIndices.some((wi) => wi % 2 === teamIdx),
        }))
      : view.players.map((p, i) => ({
          label: getNick(p),
          sublabel: null as string | null,
          score: view.scores[i],
          isWinner: winnerIndices.includes(i),
        }));

  return (
    <div className={styles.overlay}>
      <div className={styles.sheet}>
        {/* Trophy */}
        <div className={styles.trophy} aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M24 36c-6 0-10-4-10-10V10h20v16c0 6-4 10-10 10z"
              fill="var(--md-sys-color-tertiary)"
            />
            <path
              d="M10 10H6c0 6 2 10 8 12M38 10h4c0 6-2 10-8 12"
              stroke="var(--md-sys-color-tertiary)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <rect x="18" y="36" width="12" height="4" rx="2" fill="var(--md-sys-color-tertiary)" />
            <rect x="14" y="40" width="20" height="3" rx="1.5" fill="var(--md-sys-color-tertiary)" />
          </svg>
        </div>

        <h2 className={styles.title}>{t("hokm.gameOver.title")}</h2>
        <p className={styles.winnerText}>{winnerLabel}</p>
        {winnerNames && <p className={styles.winnerNames}>{winnerNames}</p>}

        {/* Scores */}
        <div className={styles.scores}>
          <p className={styles.scoresTitle}>{t("hokm.gameOver.finalScore")}</p>
          {scoreRows.map((row, i) => (
            <div
              key={i}
              className={[
                styles.scoreRow,
                row.isWinner ? styles.winnerRow : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={styles.scoreNameGroup}>
                <span className={styles.scoreName}>{row.label}</span>
                {row.sublabel && (
                  <span className={styles.scoreSublabel}>{row.sublabel}</span>
                )}
              </div>
              <span className={styles.scoreVal}>{row.score}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={[styles.btn, styles.rematchBtn].join(" ")}
            onClick={() => { setRematchRequested(true); onRematch(); }}
            disabled={rematchRequested}
            autoFocus
          >
            {rematchRequested ? t("hokm.gameOver.rematchWaiting") : t("hokm.gameOver.rematch")}
          </button>
          <button
            type="button"
            className={[styles.btn, styles.leaveBtn].join(" ")}
            onClick={() =>
              // Free our seat so a rematch by the others isn't blocked by a ghost seat.
              socket.emit("room:leave", {}, () => navigate("/lobby"))
            }
          >
            {t("hokm.gameOver.leave")}
          </button>
        </div>
      </div>
    </div>
  );
}
