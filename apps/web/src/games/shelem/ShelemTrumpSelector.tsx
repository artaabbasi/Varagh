import { useTranslation } from "react-i18next";
import type { Card, Suit } from "@varagh/shared";
import { PlayingCard } from "../../components/PlayingCard";
import styles from "../hokm/phases/TrumpSelector.module.css";

const SUITS: { suit: Suit; symbol: string; isRed: boolean }[] = [
  { suit: "hearts", symbol: "♥", isRed: true },
  { suit: "diamonds", symbol: "♦", isRed: true },
  { suit: "clubs", symbol: "♣", isRed: false },
  { suit: "spades", symbol: "♠", isRed: false },
];

interface ShelemTrumpSelectorProps {
  /** Sorted Hakem hand (shown so they can judge their trump). Hakem only. */
  hand?: Card[];
  /** Provided for the Hakem — picking a suit names trump. Absent = waiting view. */
  onChoose?: (suit: Suit) => void;
  /** Name shown to non-Hakem players while they wait. */
  hakemName?: string;
}

/**
 * Hokm-style bottom sheet for naming trump (حکم). The Hakem sees their hand and
 * the four suit buttons; everyone else sees a short "waiting" sheet. Reuses
 * Hokm's TrumpSelector styles so the moment feels identical across games.
 */
export function ShelemTrumpSelector({ hand, onChoose, hakemName }: ShelemTrumpSelectorProps) {
  const { t } = useTranslation();

  if (!onChoose) {
    return (
      <div className={styles.sheet}>
        <div className={styles.content}>
          <h2 className={styles.title}>{t("shelem.chooseTrump")}</h2>
          <p className={styles.subtitle}>{t("shelem.hakemChoosingTrump", { name: hakemName ?? "" })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sheet}>
      <div className={styles.content}>
        <h2 className={styles.title}>{t("shelem.chooseTrump")}</h2>
        <p className={styles.subtitle}>{t("shelem.chooseTrumpSub")}</p>

        <div className={styles.hand}>
          {(hand ?? []).map((card) => (
            <PlayingCard key={`${card.rank}_${card.suit}`} card={card} faceUp compact aria-label={`${card.rank} of ${card.suit}`} />
          ))}
        </div>

        <div className={styles.suitGrid}>
          {SUITS.map(({ suit, symbol, isRed }) => (
            <button
              key={suit}
              type="button"
              className={[styles.suitBtn, isRed ? styles.red : styles.black].join(" ")}
              onClick={() => onChoose(suit)}
              aria-label={t(`shelem.suits.${suit}`)}
            >
              <span className={styles.suitSymbol} aria-hidden="true">{symbol}</span>
              <span className={styles.suitName}>{t(`shelem.suits.${suit}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
