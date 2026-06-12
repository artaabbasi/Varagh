import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LobbyStats } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredToken, getStoredUser } from "../auth/auth-store";
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

/** A suit on a card — drives the four-colour palette via a data attribute. */
type Suit = "spades" | "hearts" | "diamonds" | "clubs";
const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/** Cards revealed in the scroll-flip showcase (rank + suit). */
const DECK: { rank: string; suit: Suit }[] = [
  { rank: "A", suit: "spades" },
  { rank: "K", suit: "hearts" },
  { rank: "Q", suit: "diamonds" },
  { rank: "J", suit: "clubs" },
  { rank: "10", suit: "hearts" },
  { rank: "9", suit: "spades" },
  { rank: "A", suit: "diamonds" },
];

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
  const revealRefs = useRef<(HTMLElement | null)[]>([]);
  const heroCardsRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);

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

  // Single scroll handler drives BOTH the hero scatter (--sp) and the
  // per-card deck-flip progress (--p), computed in JS so the flip can never
  // be silently dropped by a CSS unit-mismatch and so it survives any layout.
  useEffect(() => {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    // Apply each card's flip progress (0 = back showing, 1 = face showing).
    const setFlips = (reveal: number) => {
      const deck = deckRef.current;
      if (!deck) return;
      const flippers = deck.querySelectorAll<HTMLElement>("[data-flipper]");
      flippers.forEach((el, i) => {
        const start = 0.1 + i * 0.08; // staggered deal
        const p = clamp01((reveal - start) / 0.32);
        el.style.setProperty("--p", String(p));
      });
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const vh = window.innerHeight;

        const hero = heroCardsRef.current;
        if (hero) {
          const sp = Math.min(window.scrollY / vh, 1);
          hero.style.setProperty("--sp", String(sp));
        }

        const deck = deckRef.current;
        if (deck) {
          const rect = deck.getBoundingClientRect();
          // 0 as the section enters from the bottom → 1 as it leaves the top.
          const reveal = clamp01((vh - rect.top) / (vh + rect.height));
          setFlips(reveal);
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
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
      // Fire as soon as a sliver enters, and a touch before it's fully on
      // screen, so sections glide in instead of popping in late.
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
            {user ? (
              <>
                <Link to="/profile" className={styles.navUser} title={t("profile.player")}>
                  <span className={styles.navUserAvatar} aria-hidden="true">
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className={styles.navUserPhoto} />
                    ) : (
                      user.nickname.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className={styles.navUserName}>{user.nickname}</span>
                </Link>
                <button className={styles.playBtn} onClick={handlePlay}>
                  {t("landing.hero.cta")}
                </button>
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
          <div className={styles.heroCards} aria-hidden="true" ref={heroCardsRef}>
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
          </div>

          <div className={styles.scrollCue} aria-hidden="true">
            <span>{t("landing.hero.scrollCue")}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
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

        {/* ── Scroll card-flip showcase ── */}
        <section className={styles.deckSection} aria-labelledby="deck-title">
          <div className={styles.inner}>
            <h2 id="deck-title" className={styles.sectionTitle}>{t("landing.deck.title")}</h2>
            <p className={styles.deckSubtitle}>{t("landing.deck.subtitle")}</p>
          </div>
          <div className={styles.deckStage} ref={deckRef} aria-hidden="true">
            {DECK.map((c, i) => (
              <div
                key={`${c.rank}-${c.suit}-${i}`}
                className={styles.flipCard}
                style={{ "--n": i - (DECK.length - 1) / 2 } as React.CSSProperties}
              >
                <div className={styles.flipper} data-flipper>
                  <div className={styles.flipCover}>
                    <span className={styles.coverGlyph}>ورق</span>
                  </div>
                  <div className={styles.flipFace} data-suit={c.suit}>
                    <span className={styles.faceCorner}>
                      <span className={styles.faceRank}>{c.rank}</span>
                      <span className={styles.faceSuitSm}>{SUIT_SYMBOL[c.suit]}</span>
                    </span>
                    <span className={styles.faceCenter}>{SUIT_SYMBOL[c.suit]}</span>
                    <span className={`${styles.faceCorner} ${styles.faceCornerBr}`}>
                      <span className={styles.faceRank}>{c.rank}</span>
                      <span className={styles.faceSuitSm}>{SUIT_SYMBOL[c.suit]}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className={styles.deckHint} aria-hidden="true">{t("landing.deck.hint")}</p>
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

              {/* Pasur — coming soon */}
              <div className={`${styles.gameCard} ${styles.gameSoon}`} aria-disabled="true">
                <div className={styles.gameCardSuits} aria-hidden="true">
                  <span data-suit="spades">♠</span><span data-suit="hearts">♥</span>
                  <span data-suit="diamonds">♦</span><span data-suit="clubs">♣</span>
                </div>
                <h3 className={styles.gameName}>{t("landing.games.pasur.name")}</h3>
                <span className={styles.comingSoon}>{t("landing.comingSoon")}</span>
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

        {/* ── Bottom CTA ── */}
        <section className={`${styles.section} ${styles.ctaSection}`} ref={setRevealRef(3)} aria-labelledby="cta-title">
          <div className={styles.inner}>
            <h2 id="cta-title" className={styles.ctaTitle}>{t("landing.cta.title")}</h2>
            <button className={styles.heroCta} onClick={handlePlay}>
              {t("landing.hero.cta")}
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span>ورق · Varagh · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
