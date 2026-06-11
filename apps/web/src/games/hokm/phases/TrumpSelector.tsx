import { useTranslation } from "react-i18next";
import type { HokmView } from "@varagh/shared";
import type { Suit } from "@varagh/shared";
import { PlayingCard } from "../../../components/PlayingCard";
import styles from "./TrumpSelector.module.css";

const SUITS: { suit: Suit; symbol: string; isRed: boolean }[] = [
  { suit: "hearts", symbol: "♥", isRed: true },
  { suit: "diamonds", symbol: "♦", isRed: true },
  { suit: "clubs", symbol: "♣", isRed: false },
  { suit: "spades", symbol: "♠", isRed: false },
];

interface TrumpSelectorProps {
  view: HokmView;
  onChoose: (suit: Suit) => void;
}

export function TrumpSelector({ view, onChoose }: TrumpSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.sheet}>
      <div className={styles.content}>
        <h2 className={styles.title}>{t("hokm.chooseTrump")}</h2>
        <p className={styles.subtitle}>{t("hokm.chooseTrumpSubtitle")}</p>

        {/* Hakem's 5 initial cards */}
        <div className={styles.hand}>
          {view.hand.map((card) => (
            <PlayingCard
              key={`${card.rank}_${card.suit}`}
              card={card}
              faceUp
              aria-label={`${card.rank} of ${card.suit}`}
            />
          ))}
        </div>

        {/* Suit selection buttons */}
        <div className={styles.suitGrid}>
          {SUITS.map(({ suit, symbol, isRed }) => (
            <button
              key={suit}
              type="button"
              className={[styles.suitBtn, isRed ? styles.red : styles.black].join(" ")}
              onClick={() => onChoose(suit)}
              aria-label={t(`hokm.suits.${suit}`)}
            >
              <span className={styles.suitSymbol} aria-hidden="true">
                {symbol}
              </span>
              <span className={styles.suitName}>{t(`hokm.suits.${suit}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
