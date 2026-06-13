import { useTranslation } from "react-i18next";
import type { HokmView, RoomView } from "@varagh/shared";
import styles from "./TrumpWaiting.module.css";

interface TrumpWaitingProps {
  view: HokmView;
  room: RoomView | null;
  lang: "fa" | "en";
}

const SHUFFLE_CARDS = [
  { colorClass: styles.black, animClass: styles.card1 },
  { colorClass: styles.red,   animClass: styles.card2 },
  { colorClass: styles.blue,  animClass: styles.card3 },
] as const;

export function TrumpWaiting({ view, room }: TrumpWaitingProps) {
  const { t } = useTranslation();
  const hakemId = view.players[view.hakemIndex];
  const hakemSeat = room?.seats.find((s) => s.playerId === hakemId);
  const hakemName = hakemSeat?.nickname ?? hakemId.slice(0, 8);

  return (
    <div className={styles.sheet}>
      <div className={styles.content}>
        <div className={styles.shuffleDeck} aria-hidden="true">
          {SHUFFLE_CARDS.map((c, i) => (
            <div key={i} className={[styles.card, c.animClass].join(" ")}>
              <span className={[styles.cardRank, c.colorClass].join(" ")}>?</span>
            </div>
          ))}
        </div>
        <p className={styles.text}>
          {t("hokm.hakemChoosingTrump", { name: hakemName })}
        </p>
      </div>
    </div>
  );
}
