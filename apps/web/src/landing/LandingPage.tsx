import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LobbyStats } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredToken } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import styles from "./LandingPage.module.css";

function IconBolt() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconDevice() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconVariants() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <line x1="8.7" y1="10.7" x2="15.3" y2="7.3" />
      <line x1="8.7" y1="13.3" x2="15.3" y2="16.7" />
    </svg>
  );
}

const FEATURE_ICONS = [IconBolt, IconDevice, IconLock, IconVariants];
const FEATURE_KEYS = ["f1", "f2", "f3", "f4"] as const;

export function LandingPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const isRtl = i18n.language === "fa";

  const [stats, setStats] = useState<LobbyStats | null>(null);
  const revealRefs = useRef<(HTMLElement | null)[]>([]);
  const heroCardsRef = useRef<HTMLDivElement>(null);

  const handlePlay = () => {
    void navigate(getStoredToken() ? "/lobby" : "/signup");
  };

  const toggleLang = () => {
    void i18n.changeLanguage(isRtl ? "en" : "fa");
  };

  // Fetch live stats once socket is ready
  useEffect(() => {
    const fetch = () => {
      socket.emit("lobby:getStats", {}, (res) => {
        if (res.ok) setStats(res.stats);
      });
    };
    if (socket.connected) {
      fetch();
    } else {
      socket.once("connect", fetch);
    }
  }, []);

  // Scroll-parallax: cards scatter as user scrolls out of hero
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf: number;
    const onScroll = () => {
      raf = requestAnimationFrame(() => {
        const vh = window.innerHeight;
        const t = Math.min(window.scrollY / vh, 1); // 0 → 1 over one screen height
        const el = heroCardsRef.current;
        if (!el) return;
        el.style.setProperty("--sp", String(t));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
          }
        });
      },
      { threshold: 0.08 },
    );
    revealRefs.current.forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const setRevealRef = (index: number) => (el: HTMLElement | null) => {
    revealRefs.current[index] = el;
  };

  return (
    <div className={styles.page}>
      {/* ── Navigation ── */}
      <nav className={styles.nav} aria-label="Main navigation">
        <span className={styles.navLogo} aria-label="Varagh">ورق</span>
        <div className={styles.navActions}>
          <button className={styles.navBtn} onClick={toggleLang} aria-label="Toggle language">
            {isRtl ? "EN" : "فا"}
          </button>
          <button className={styles.navBtn} onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button className={styles.playBtn} onClick={handlePlay}>
            {t("landing.hero.cta")}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroCards} aria-hidden="true" ref={heroCardsRef}>
          <div className={`${styles.floatCard} ${styles.fc1}`}>
            <span className={styles.fcVal}>A</span>
            <span className={styles.fcSuit}>♠</span>
          </div>
          <div className={`${styles.floatCard} ${styles.fc2}`}>
            <span className={styles.fcVal}>K</span>
            <span className={`${styles.fcSuit} ${styles.red}`}>♥</span>
          </div>
          <div className={`${styles.floatCard} ${styles.fc3}`}>
            <span className={styles.fcVal}>Q</span>
            <span className={`${styles.fcSuit} ${styles.red}`}>♦</span>
          </div>
          <div className={`${styles.floatCard} ${styles.fc4}`}>
            <span className={styles.fcVal}>J</span>
            <span className={styles.fcSuit}>♣</span>
          </div>
          <div className={`${styles.floatCard} ${styles.fc5}`}>
            <span className={styles.fcVal}>10</span>
            <span className={styles.fcSuit}>♠</span>
          </div>
        </div>

        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            ورق
          </h1>
          <p className={styles.heroSub}>Varagh</p>
          <p className={styles.heroTagline}>{t("landing.hero.tagline")}</p>
          <button className={styles.heroCta} onClick={handlePlay}>
            {t("landing.hero.cta")}
          </button>
        </div>
      </section>

      {/* ── Live stats band ── */}
      <div className={styles.statsBand} aria-label="Live platform stats">
        {(
          [
            { key: "online",      val: stats?.onlineCount  },
            { key: "activeGames", val: stats?.activeGames  },
            { key: "publicRooms", val: stats?.publicRooms  },
            { key: "totalUsers",  val: stats?.totalUsers   },
          ] as const
        ).map(({ key, val }) => (
          <div key={key} className={styles.statItem}>
            <span className={styles.statVal}>
              {val !== undefined ? val.toLocaleString() : "—"}
            </span>
            <span className={styles.statKey}>{t(`landingStats.${key}`)}</span>
          </div>
        ))}
      </div>

      {/* ── Games ── */}
      <section
        className={styles.section}
        ref={setRevealRef(0)}
      >
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle}>{t("landing.games.title")}</h2>
          <div className={styles.gameGrid}>
            {/* Hokm — available */}
            <div className={styles.gameCard} onClick={handlePlay} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") handlePlay(); }}>
              <div className={styles.gameCardSuits} aria-hidden="true">
                <span>♠</span><span className={styles.red}>♥</span>
                <span className={styles.red}>♦</span><span>♣</span>
              </div>
              <h3 className={styles.gameName}>{t("landing.games.hokm.name")}</h3>
              <p className={styles.gameDesc}>{t("landing.games.hokm.desc")}</p>
              <div className={styles.gameFooter}>
                <span className={styles.gamePlayers}>{t("landing.games.hokm.players")}</span>
                <button
                  className={styles.gamePlayBtn}
                  onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                >
                  {t("landing.hero.cta")}
                </button>
              </div>
            </div>

            {/* Shelem — coming soon */}
            <div className={`${styles.gameCard} ${styles.gameSoon}`} aria-disabled="true">
              <div className={styles.gameCardSuits} aria-hidden="true">
                <span>♠</span><span className={styles.red}>♥</span>
                <span className={styles.red}>♦</span><span>♣</span>
              </div>
              <h3 className={styles.gameName}>{t("landing.games.shelem.name")}</h3>
              <span className={styles.comingSoon}>{t("landing.comingSoon")}</span>
            </div>

            {/* Pasur — coming soon */}
            <div className={`${styles.gameCard} ${styles.gameSoon}`} aria-disabled="true">
              <div className={styles.gameCardSuits} aria-hidden="true">
                <span>♠</span><span className={styles.red}>♥</span>
                <span className={styles.red}>♦</span><span>♣</span>
              </div>
              <h3 className={styles.gameName}>{t("landing.games.pasur.name")}</h3>
              <span className={styles.comingSoon}>{t("landing.comingSoon")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section
        className={`${styles.section} ${styles.featureSection}`}
        ref={setRevealRef(1)}
      >
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle}>{t("landing.features.title")}</h2>
          <div className={styles.featureGrid}>
            {FEATURE_KEYS.map((key, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <div key={key} className={styles.featureCard}>
                  <div className={styles.featureIcon}>
                    <Icon />
                  </div>
                  <p className={styles.featureText}>{t(`landing.features.${key}`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How to play ── */}
      <section
        className={styles.section}
        ref={setRevealRef(2)}
      >
        <div className={styles.inner}>
          <h2 className={styles.sectionTitle}>{t("landing.howto.title")}</h2>
          <ol className={styles.steps} aria-label={t("landing.howto.title")}>
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className={styles.step}>
                <div className={styles.stepNum} aria-hidden="true">{n}</div>
                <div className={styles.stepBody}>
                  <h3 className={styles.stepTitle}>{t(`landing.howto.s${n}.title`)}</h3>
                  <p className={styles.stepDesc}>{t(`landing.howto.s${n}.desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        className={`${styles.section} ${styles.ctaSection}`}
        ref={setRevealRef(3)}
      >
        <div className={styles.inner}>
          <h2 className={styles.ctaTitle}>{t("landing.cta.title")}</h2>
          <button className={styles.heroCta} onClick={handlePlay}>
            {t("landing.hero.cta")}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span>ورق · Varagh · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
