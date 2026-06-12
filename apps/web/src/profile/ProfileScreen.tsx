import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MatchHistoryEntry } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredUser } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import styles from "./ProfileScreen.module.css";

function shortVariantKey(variantId: string) {
  const m = /(\d+)p$/.exec(variantId);
  return m ? `${m[1]}p` : variantId;
}

function formatDate(ts: number, lang: string) {
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  }).format(new Date(ts));
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const isRtl = i18n.language === "fa";
  const user = getStoredUser();

  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    socket.emit("user:getHistory", {}, (res) => {
      setLoading(false);
      if (res.ok) setMatches(res.matches);
    });
  }, []);

  const wins = matches.filter((m) => m.isWinner).length;
  const losses = matches.length - wins;
  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0;

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => void navigate("/lobby")}>
          <BackIcon />
        </button>
        <span className={styles.logo} aria-label="Varagh">ورق</span>
        <div className={styles.topActions}>
          <button className={styles.iconBtn} onClick={() => void i18n.changeLanguage(isRtl ? "en" : "fa")}>
            {isRtl ? "EN" : "فا"}
          </button>
          <button className={styles.iconBtn} onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* ── User card ── */}
        <div className={styles.userCard}>
          <div className={styles.avatar} aria-hidden="true">
            {user?.nickname?.slice(0, 1).toUpperCase() ?? "?"}
          </div>
          <div className={styles.userInfo}>
            <h1 className={styles.userName}>
              {user?.nickname ?? "—"}
              <span className={styles.disc}>#{user?.discriminator}</span>
            </h1>
            <p className={styles.userSub}>{t("profile.player")}</p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statVal}>{matches.length}</span>
            <span className={styles.statLabel}>{t("profile.stats.games")}</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statVal} ${styles.win}`}>{wins}</span>
            <span className={styles.statLabel}>{t("profile.stats.wins")}</span>
          </div>
          <div className={styles.statCard}>
            <span className={`${styles.statVal} ${styles.loss}`}>{losses}</span>
            <span className={styles.statLabel}>{t("profile.stats.losses")}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statVal}>{winRate}%</span>
            <span className={styles.statLabel}>{t("profile.stats.winRate")}</span>
          </div>
        </div>

        {/* ── Match history ── */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("profile.history.title")}</h2>

          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} aria-hidden="true" />
            </div>
          ) : matches.length === 0 ? (
            <p className={styles.empty}>{t("profile.history.empty")}</p>
          ) : (
            <ul className={styles.matchList} aria-label={t("profile.history.title")}>
              {matches.map((m) => (
                <li key={m.matchId} className={`${styles.matchItem} ${m.isWinner ? styles.matchWin : styles.matchLoss}`}>
                  <div className={styles.matchResult}>
                    <span className={m.isWinner ? styles.winBadge : styles.lossBadge}>
                      {m.isWinner ? t("profile.history.win") : t("profile.history.loss")}
                    </span>
                  </div>
                  <div className={styles.matchInfo}>
                    <span className={styles.matchGame}>
                      Hokm · حکم
                      <span className={styles.matchVariant}>{shortVariantKey(m.variantId)}</span>
                    </span>
                    {m.opponents.length > 0 && (
                      <span className={styles.matchOpponents}>
                        {t("profile.history.vs")} {m.opponents.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className={styles.matchDate}>
                    {formatDate(m.endedAt, i18n.language)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

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
