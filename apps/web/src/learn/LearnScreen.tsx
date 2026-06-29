import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getStoredToken } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import { Logo } from "../components/Logo";
import styles from "./LearnScreen.module.css";

/** Games covered by the beginner guide, in display order. */
const LEARN_GAMES = ["hokm", "pasur"] as const;

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function LearnScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const isRtl = i18n.language === "fa";

  const handlePlay = () => void navigate(getStoredToken() ? "/lobby" : "/signup");

  // i18n list helper — returns [] if the key is missing or not an array.
  const list = (key: string): string[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as string[]) : [];
  };

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => void navigate(-1)} aria-label={t("learn.back")}>
          <BackIcon />
        </button>
        <Link to="/" className={styles.logo} aria-label="Varagh — home">
          <Logo variant="horizontal" size={24} />
        </Link>
        <div className={styles.topActions}>
          <button className={styles.iconBtn} onClick={() => void i18n.changeLanguage(isRtl ? "en" : "fa")} aria-label="Toggle language">
            {isRtl ? "EN" : "فا"}
          </button>
          <button className={styles.iconBtn} onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t("learn.title")}</h1>
          <p className={styles.subtitle}>{t("learn.subtitle")}</p>
        </div>

        {LEARN_GAMES.map((id) => (
          <article key={id} className={styles.gameCard}>
            <div className={styles.gameHead}>
              <span className={styles.gameSuits} aria-hidden="true">
                <span data-suit="spades">♠</span><span data-suit="hearts">♥</span>
                <span data-suit="diamonds">♦</span><span data-suit="clubs">♣</span>
              </span>
              <div className={styles.gameHeadText}>
                <h2 className={styles.gameName}>{t(`learn.games.${id}.name`)}</h2>
                <p className={styles.gameTagline}>{t(`learn.games.${id}.tagline`)}</p>
              </div>
              <span className={styles.playersBadge}>{t(`learn.games.${id}.players`)}</span>
            </div>

            <div className={styles.goal}>
              <span className={styles.goalLabel}>{t("learn.goal")}</span>
              <p className={styles.goalText}>{t(`learn.games.${id}.goal`)}</p>
            </div>

            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{t("learn.basics")}</h3>
              <ul className={styles.bulletList}>
                {list(`learn.games.${id}.basics`).map((line, i) => (
                  <li key={i} className={styles.bullet}>{line}</li>
                ))}
              </ul>
            </div>

            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{t("learn.tips")}</h3>
              <ul className={[styles.bulletList, styles.tipList].join(" ")}>
                {list(`learn.games.${id}.tips`).map((line, i) => (
                  <li key={i} className={styles.bullet}>{line}</li>
                ))}
              </ul>
            </div>

            <button className={styles.playBtn} onClick={handlePlay}>
              {t("learn.play")}
            </button>
          </article>
        ))}
      </main>
    </div>
  );
}
