import styles from "./PlayerAvatar.module.css";

interface PlayerAvatarProps {
  nickname: string;
  discriminator?: string;
  isHakem?: boolean;
  isConnected?: boolean;
  teamColor?: "primary" | "tertiary" | "none";
  compact?: boolean;
  className?: string;
  /** Optional photo (data URL). Falls back to the coloured initial. */
  avatarUrl?: string | null;
}

/** Stable hue from nickname — used to pick the avatar background. */
function nicknameHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return hash % 360;
}

/** Crown SVG for the Hakem indicator. */
function Crown() {
  return (
    <svg
      className={styles.crown}
      viewBox="0 0 24 16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M2 14l3-8 4 5 3-9 3 9 4-5 3 8H2z" />
    </svg>
  );
}

export function PlayerAvatar({
  nickname,
  discriminator,
  isHakem = false,
  isConnected = true,
  teamColor = "none",
  compact = false,
  className,
  avatarUrl,
}: PlayerAvatarProps) {
  const hue = nicknameHue(nickname);
  const initial = [...nickname].find((c) => /\p{L}/u.test(c)) ?? "?";

  return (
    <div
      className={[
        styles.wrapper,
        compact ? styles.compact : null,
        teamColor !== "none" ? styles[`team_${teamColor}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isHakem && <Crown />}
      <div
        className={[styles.circle, !isConnected ? styles.disconnected : null]
          .filter(Boolean)
          .join(" ")}
        style={{ "--avatar-hue": hue } as React.CSSProperties}
        aria-label={nickname}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className={styles.photo} />
        ) : (
          <span className={styles.initial} aria-hidden="true">
            {initial}
          </span>
        )}
        {!isConnected && <span className={styles.offlineDot} aria-hidden="true" />}
      </div>
      <span className={styles.name}>
        {nickname}
        {discriminator && (
          <span className={styles.discriminator}>#{discriminator}</span>
        )}
      </span>
    </div>
  );
}
