import styles from "./TrickPile.module.css";

interface TrickPileProps {
  count: number;
  teamColor?: "primary" | "tertiary" | "none";
  className?: string;
}

export function TrickPile({ count, teamColor = "none", className }: TrickPileProps) {
  if (count === 0) return null;

  return (
    <div
      className={[
        styles.pile,
        teamColor !== "none" ? styles[`team_${teamColor}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${count} tricks won`}
    >
      {[2, 1, 0].map((offset) => (
        <div
          key={offset}
          className={styles.card}
          style={{ "--offset": offset } as React.CSSProperties}
        />
      ))}
      <span className={styles.badge}>{count}</span>
    </div>
  );
}
