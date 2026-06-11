import { useTranslation } from "react-i18next";
import type { HokmView, RoomView } from "@varagh/shared";
import styles from "./TrumpWaiting.module.css";

interface TrumpWaitingProps {
  view: HokmView;
  room: RoomView | null;
  lang: "fa" | "en";
}

export function TrumpWaiting({ view, room, lang }: TrumpWaitingProps) {
  const { t } = useTranslation();
  const hakemId = view.players[view.hakemIndex];
  const hakemSeat = room?.seats.find((s) => s.playerId === hakemId);
  const hakemName = hakemSeat?.nickname ?? hakemId.slice(0, 8);

  return (
    <div className={styles.sheet}>
      <div className={styles.content}>
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.text}>
          {t("hokm.hakemChoosingTrump", { name: hakemName })}
        </p>
      </div>
    </div>
  );
}
