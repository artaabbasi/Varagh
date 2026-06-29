import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";
import styles from "./CardLoadingScreen.module.css";

const CARDS = [
  { rank: "A", suit: "♠", colorClass: "black",  landX: "-46px", landY: "8px",  landRot: "-20deg" },
  { rank: "K", suit: "♥", colorClass: "red",    landX: "-15px", landY: "-8px", landRot: "-7deg"  },
  { rank: "Q", suit: "♦", colorClass: "blue",   landX: "15px",  landY: "8px",  landRot: "7deg"   },
  { rank: "J", suit: "♣", colorClass: "green",  landX: "46px",  landY: "-8px", landRot: "20deg"  },
] as const;

const DELAY_MS = [0, 200, 400, 600] as const;

export function CardLoadingScreen() {
  const { t } = useTranslation();

  return (
    <div className={styles.screen} aria-live="polite">
      <div className={styles.deck} aria-hidden="true">
        {CARDS.map((c, i) => (
          <div
            key={c.suit}
            className={styles.card}
            style={{
              "--delay": `${DELAY_MS[i]}ms`,
              "--land-x": c.landX,
              "--land-y": c.landY,
              "--land-rot": c.landRot,
            } as React.CSSProperties}
          >
            <div className={[styles.corner, styles[c.colorClass]].join(" ")}>
              <span className={styles.rank}>{c.rank}</span>
              <span className={styles.suitSmall}>{c.suit}</span>
            </div>
            <span className={[styles.centerSuit, styles[c.colorClass]].join(" ")}>{c.suit}</span>
            <div className={[styles.corner, styles.cornerBr, styles[c.colorClass]].join(" ")}>
              <span className={styles.rank}>{c.rank}</span>
              <span className={styles.suitSmall}>{c.suit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.brand}>
        <Logo variant="icon" size={72} />
        <span className={styles.brandEn}>Varagh</span>
      </div>

      <p className={styles.status}>{t("hokm.loading")}</p>
    </div>
  );
}
