import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LobbyStats } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredToken, getStoredUser } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import { Logo } from "../components/Logo";
import { InstallPrompt } from "./InstallPrompt";
import { isInstalled } from "./pwa-install";
import styles from "./LandingPage.module.css";

/* ──────────────────────────────────────────────────────────────────────────
 * Contact details — EDIT THESE with your own handles. Placeholders for now.
 * `telegram` / `instagram` are usernames without the leading "@".
 * ────────────────────────────────────────────────────────────────────────── */
const CONTACT = {
  name: "Arta",
  telegram: "novabtw",
  email: "notartaabbasi@gmail.com",
  instagram: "artaeabbasi",
};

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

function IconTelegram() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.846-10.405a1.441 1.441 0 1 1-2.883 0 1.441 1.441 0 0 1 2.883 0z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

const FEATURE_ICONS = [IconBolt, IconDevice, IconLock, IconVariants];
const FEATURE_KEYS = ["f1", "f2", "f3", "f4"] as const;

/** A suit on a card — drives the four-colour palette via a data attribute. */
type Suit = "spades" | "hearts" | "diamonds" | "clubs";
const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/** Floating hero cards — colourful four-suit set. */
const HERO_CARDS: { rank: string; suit: Suit; cls: string }[] = [
  { rank: "A", suit: "spades", cls: "fc1" },
  { rank: "K", suit: "hearts", cls: "fc2" },
  { rank: "Q", suit: "diamonds", cls: "fc3" },
  { rank: "J", suit: "clubs", cls: "fc4" },
  { rank: "10", suit: "spades", cls: "fc5" },
];

/** Animates a number from 0 → target whenever target changes (≈900ms). */
function useCountUp(target: number | undefined): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === undefined) return;
    let raf: number;
    const start = performance.now();
    const from = 0;
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function StatValue({ value }: { value: number | undefined }) {
  const display = useCountUp(value);
  return <span className={styles.statVal}>{value !== undefined ? display.toLocaleString() : "—"}</span>;
}

export function LandingPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const isRtl = i18n.language === "fa";
  const user = getStoredUser();

  const [stats, setStats] = useState<LobbyStats | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const revealRefs = useRef<(HTMLElement | null)[]>([]);
  const appInstalled = isInstalled();

  const handlePlay = () => {
    void navigate(getStoredToken() ? "/lobby" : "/signup");
  };

  const goLearn = () => void navigate("/learn");

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

  // Reveal-on-scroll for content sections
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
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
      <header className={styles.nav}>
        <nav className={styles.navInner} aria-label="Main navigation">
          <a href="/" className={styles.navLogo} aria-label="Varagh — home">
            <Logo variant="horizontal" size={26} />
          </a>
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
            {user ? (
              <>
                <button className={styles.playBtn} onClick={handlePlay}>
                  {t("landing.hero.cta")}
                </button>
                <Link to="/profile" className={styles.navAvatar} title={user.nickname} aria-label={t("profile.player")}>
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className={styles.navAvatarPhoto} />
                  ) : (
                    <span aria-hidden="true">{user.nickname.slice(0, 1).toUpperCase()}</span>
                  )}
                </Link>
              </>
            ) : (
              <>
                <button className={styles.navBtn} onClick={() => void navigate("/signin")}>
                  {t("landing.nav.login")}
                </button>
                <button className={styles.playBtn} onClick={() => void navigate("/signup")}>
                  {t("landing.nav.signup")}
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCards} aria-hidden="true">
            {HERO_CARDS.map((c) => (
              <div
                key={c.cls}
                className={`${styles.floatCard} ${styles[c.cls]}`}
                data-suit={c.suit}
              >
                <span className={styles.fcVal}>{c.rank}</span>
                <span className={styles.fcSuit}>{SUIT_SYMBOL[c.suit]}</span>
              </div>
            ))}
          </div>

          <div className={styles.heroContent}>
            <h1 id="hero-title" className={styles.heroTitle}>ورق</h1>
            <p className={styles.heroSub}>Varagh</p>
            <p className={styles.heroTagline}>{t("landing.hero.tagline")}</p>
            <button className={styles.heroCta} onClick={handlePlay}>
              {t("landing.hero.cta")}
            </button>
            <div className={styles.heroSecondary}>
              <button className={styles.heroGhost} onClick={goLearn}>
                {t("learn.nav")}
              </button>
              {!appInstalled && (
                <button className={styles.heroGhost} onClick={() => setShowInstall(true)}>
                  {t("install.nav")}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Live stats band ── */}
        <section className={styles.statsBand} aria-label="Live platform stats">
          <div className={styles.liveTag}>
            <span className={styles.liveDot} aria-hidden="true" />
            {t("landing.liveTag")}
          </div>
          <div className={styles.statsRow}>
            {(
              [
                { key: "online",      val: stats?.onlineCount  },
                { key: "activeGames", val: stats?.activeGames  },
                { key: "publicRooms", val: stats?.publicRooms  },
                { key: "totalUsers",  val: stats?.totalUsers   },
              ] as const
            ).map(({ key, val }) => (
              <div key={key} className={styles.statItem}>
                <StatValue value={val} />
                <span className={styles.statKey}>{t(`landingStats.${key}`)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Games ── */}
        <section className={styles.section} ref={setRevealRef(0)} aria-labelledby="games-title">
          <div className={styles.inner}>
            <h2 id="games-title" className={styles.sectionTitle}>{t("landing.games.title")}</h2>
            <div className={styles.gameGrid}>
              {/* Hokm — available */}
              <div className={`${styles.gameCard} ${styles.gameHokm}`} onClick={handlePlay} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") handlePlay(); }}>
                <div className={styles.gameCardSuits} aria-hidden="true">
                  <span data-suit="spades">♠</span><span data-suit="hearts">♥</span>
                  <span data-suit="diamonds">♦</span><span data-suit="clubs">♣</span>
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
                  <span data-suit="spades">♠</span><span data-suit="hearts">♥</span>
                  <span data-suit="diamonds">♦</span><span data-suit="clubs">♣</span>
                </div>
                <h3 className={styles.gameName}>{t("landing.games.shelem.name")}</h3>
                <span className={styles.comingSoon}>{t("landing.comingSoon")}</span>
              </div>

              {/* Pasur (Chahar Barg) — available */}
              <div className={`${styles.gameCard} ${styles.gameHokm}`} onClick={handlePlay} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") handlePlay(); }}>
                <div className={styles.gameCardSuits} aria-hidden="true">
                  <span data-suit="spades">♠</span><span data-suit="hearts">♥</span>
                  <span data-suit="diamonds">♦</span><span data-suit="clubs">♣</span>
                </div>
                <h3 className={styles.gameName}>{t("landing.games.pasur.name")}</h3>
                <p className={styles.gameDesc}>{t("landing.games.pasur.desc")}</p>
                <div className={styles.gameFooter}>
                  <span className={styles.gamePlayers}>{t("landing.games.pasur.players")}</span>
                  <button
                    className={styles.gamePlayBtn}
                    onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                  >
                    {t("landing.hero.cta")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className={`${styles.section} ${styles.featureSection}`} ref={setRevealRef(1)} aria-labelledby="features-title">
          <div className={styles.inner}>
            <h2 id="features-title" className={styles.sectionTitle}>{t("landing.features.title")}</h2>
            <div className={styles.featureGrid}>
              {FEATURE_KEYS.map((key, i) => {
                const Icon = FEATURE_ICONS[i];
                return (
                  <div key={key} className={styles.featureCard} data-accent={i}>
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
        <section className={styles.section} ref={setRevealRef(2)} aria-labelledby="howto-title">
          <div className={styles.inner}>
            <h2 id="howto-title" className={styles.sectionTitle}>{t("landing.howto.title")}</h2>
            <ol className={styles.steps}>
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

        {/* ── Contact ── */}
        <section className={`${styles.section} ${styles.contactSection}`} ref={setRevealRef(3)} aria-labelledby="contact-title">
          <div className={styles.inner}>
            <h2 id="contact-title" className={styles.sectionTitle}>{t("landing.contact.title")}</h2>
            <p className={styles.contactSubtitle}>{t("landing.contact.subtitle")}</p>
            <div className={styles.contactGrid}>
              <a
                className={`${styles.contactCard} ${styles.contactTelegram}`}
                href={`https://t.me/${CONTACT.telegram}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.contactIcon}><IconTelegram /></span>
                <span className={styles.contactBody}>
                  <span className={styles.contactLabel}>{t("landing.contact.telegram")}</span>
                  <span className={styles.contactValue}>@{CONTACT.telegram}</span>
                </span>
              </a>

              <a
                className={`${styles.contactCard} ${styles.contactInstagram}`}
                href={`https://instagram.com/${CONTACT.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.contactIcon}><IconInstagram /></span>
                <span className={styles.contactBody}>
                  <span className={styles.contactLabel}>{t("landing.contact.instagram")}</span>
                  <span className={styles.contactValue}>@{CONTACT.instagram}</span>
                </span>
              </a>

              <a
                className={`${styles.contactCard} ${styles.contactEmail}`}
                href={`mailto:${CONTACT.email}`}
              >
                <span className={styles.contactIcon}><IconMail /></span>
                <span className={styles.contactBody}>
                  <span className={styles.contactLabel}>{t("landing.contact.email")}</span>
                  <span className={styles.contactValue}>{CONTACT.email}</span>
                </span>
              </a>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className={`${styles.section} ${styles.ctaSection}`} ref={setRevealRef(4)} aria-labelledby="cta-title">
          <div className={styles.inner}>
            <h2 id="cta-title" className={styles.ctaTitle}>{t("landing.cta.title")}</h2>
            <button className={styles.heroCta} onClick={handlePlay}>
              {t("landing.hero.cta")}
            </button>
            <div className={styles.heroSecondary}>
              <button className={styles.heroGhost} onClick={goLearn}>
                {t("learn.nav")}
              </button>
              {!appInstalled && (
                <button className={styles.heroGhost} onClick={() => setShowInstall(true)}>
                  {t("install.nav")}
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <Logo variant="horizontal" size={22} />
        <span>· {new Date().getFullYear()}</span>
      </footer>

      <InstallPrompt open={showInstall} onClose={() => setShowInstall(false)} />
    </div>
  );
}
