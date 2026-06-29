import styles from "./Logo.module.css";

// Served from apps/web/public — same source as the favicon / PWA icons.
const iconUrl = "/icon.png";

type Variant = "icon" | "horizontal" | "wordmark";

interface LogoProps {
  /** `icon` = mark only · `wordmark` = Varagh text only · `horizontal` = both (default). */
  variant?: Variant;
  /** Icon edge length in px (horizontal/icon). Wordmark scales from this too. */
  size?: number;
  /** Show the "Play · Connect · Win" tagline beneath the wordmark. */
  tagline?: boolean;
  className?: string;
}

/**
 * The Varagh brand lockup. The icon is the gradient V+card-fan mark (shared with
 * the favicon / PWA icons); the wordmark is live text in the brand display font
 * so it stays crisp, themeable and accessible. Always laid out LTR — a logo
 * reads the same in both UI directions.
 */
export function Logo({ variant = "horizontal", size = 28, tagline = false, className }: LogoProps) {
  const showIcon = variant !== "wordmark";
  const showWord = variant !== "icon";
  return (
    <span
      className={`${styles.logo} ${className ?? ""}`}
      style={{ ["--logo-size" as string]: `${size}px` }}
      aria-label="Varagh"
      role="img"
    >
      {showIcon && <img className={styles.icon} src={iconUrl} alt="" aria-hidden="true" />}
      {showWord && (
        <span className={styles.text}>
          <span className={styles.word} aria-hidden="true">
            Varagh
          </span>
          {tagline && (
            <span className={styles.tagline} aria-hidden="true">
              <span className={styles.tPlay}>Play.</span>{" "}
              <span className={styles.tConnect}>Connect.</span>{" "}
              <span className={styles.tWin}>Win.</span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
