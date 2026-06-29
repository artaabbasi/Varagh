import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LobbyEntry, ActiveRoomEntry, VariantDefinition } from "@varagh/shared";
import { games } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredUser } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import { SoundToggle } from "../components/SoundToggle";
import { FriendsPanel } from "./FriendsPanel";
import styles from "./LobbyScreen.module.css";

const JOIN_CODE_RE = /^[A-Za-z]{6}$/;

/** Default option values for a variant, e.g. { targetScore: 7, ... }. */
function defaultOptions(variant: VariantDefinition): Record<string, unknown> {
  return Object.fromEntries((variant.options ?? []).map((o) => [o.key, o.default]));
}

/** Trailing player-count tag of a variant id, e.g. "hokm-2p" / "pasur-2p" → "2p". */
function shortVariantKey(variantId: string): string {
  return /(\d+p)$/.exec(variantId)?.[1] ?? variantId;
}

/** Display name for a game id straight from the shared registry. */
function gameName(gameId: string, lang: "en" | "fa"): string {
  const g = games.find((x) => x.id === gameId);
  return g ? g.name[lang] ?? g.name.en : gameId;
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function LobbyScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const isRtl = i18n.language === "fa";

  const user = getStoredUser();

  // ── Create game state (registry-driven — no game-specific hardcoding) ──
  const lang: "en" | "fa" = isRtl ? "fa" : "en";
  const [showCreate, setShowCreate] = useState(false);
  const [gameId, setGameId] = useState(games[0].id);
  const gameDef = games.find((g) => g.id === gameId) ?? games[0];
  const [variantId, setVariantId] = useState(gameDef.variants[0].id);
  const variantDef =
    gameDef.variants.find((v) => v.id === variantId) ?? gameDef.variants[0];
  const [options, setOptions] = useState<Record<string, unknown>>(() =>
    defaultOptions(gameDef.variants[0]),
  );
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectGame = (id: string) => {
    const g = games.find((x) => x.id === id) ?? games[0];
    setGameId(id);
    setVariantId(g.variants[0].id);
    setOptions(defaultOptions(g.variants[0]));
  };
  const selectVariant = (id: string) => {
    const v = gameDef.variants.find((x) => x.id === id) ?? gameDef.variants[0];
    setVariantId(id);
    setOptions(defaultOptions(v));
  };
  const setOption = (key: string, value: unknown) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  // ── Join by code state ───────────────────────────────────────────
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // ── Public rooms state ───────────────────────────────────────────
  const [rooms, setRooms] = useState<LobbyEntry[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // ── Active (in-progress) rooms for this player ──────────────────
  const [activeRooms, setActiveRooms] = useState<ActiveRoomEntry[]>([]);

  // ── Friend invite toast ──────────────────────────────────────────
  const [friendInvite, setFriendInvite] = useState<{ roomCode: string; fromName: string } | null>(null);

  // `showSpinner` is true for the first load and the manual refresh button;
  // the background poll passes false so the list updates without flicker.
  const fetchRooms = useCallback((showSpinner = true) => {
    if (showSpinner) setLoadingRooms(true);
    socket.emit("room:list", {}, (res) => {
      setLoadingRooms(false);
      if (res.ok) setRooms(res.rooms);
    });
  }, []);

  const fetchActiveRooms = useCallback(() => {
    socket.emit("user:getActiveRooms", {}, (res) => {
      if (res.ok) setActiveRooms(res.rooms);
    });
  }, []);

  useEffect(() => {
    fetchRooms();
    fetchActiveRooms();
  }, [fetchRooms, fetchActiveRooms]);

  // Keep the public-room list and active-games banner live: re-poll every few
  // seconds while the tab is visible and the socket is connected.
  useEffect(() => {
    const POLL_MS = 5000;
    const id = setInterval(() => {
      if (document.hidden || !socket.connected) return;
      fetchRooms(false);
      fetchActiveRooms();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchRooms, fetchActiveRooms]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    socket.emit(
      "room:create",
      {
        gameId,
        variantId,
        options,
        isPublic,
      },
      (res) => {
        setCreating(false);
        if (!res.ok) {
          setCreateError(t("lobby.errors.createFailed"));
          return;
        }
        void navigate(`/room/${res.joinCode}`);
      },
    );
  };

  const handleJoin = (code: string) => {
    const upper = code.toUpperCase().trim();
    if (!JOIN_CODE_RE.test(upper)) {
      setJoinError(t("lobby.errors.invalidCode"));
      return;
    }
    setJoining(true);
    setJoinError(null);
    socket.emit("room:join", { joinCode: upper }, (res) => {
      setJoining(false);
      if (!res.ok) {
        setJoinError(t("lobby.errors.joinFailed"));
        return;
      }
      void navigate(`/room/${res.room.code}`);
    });
  };

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleJoin(joinCode);
  };

  const handleHome = () => {
    void navigate("/");
  };

  return (
    <div className={styles.page}>
      {/* ── Top bar ── */}
      <header className={styles.topBar}>
        <Link to="/" className={styles.logo} aria-label="Varagh">ورق</Link>

        <div className={styles.userInfo}>
          {user && (
            <>
              <span className={styles.nickname}>{user.nickname}</span>
              <span className={styles.discriminator}>#{user.discriminator}</span>
            </>
          )}
        </div>

        <div className={styles.topActions}>
          <Link to="/profile" className={styles.iconBtn} aria-label={t("profile.player")}>
            <ProfileIcon />
          </Link>
          <button
            className={styles.iconBtn}
            onClick={() => void i18n.changeLanguage(isRtl ? "en" : "fa")}
            aria-label="Toggle language"
          >
            {isRtl ? "EN" : "فا"}
          </button>
          <button className={styles.iconBtn} onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <SoundToggle className={styles.iconBtn} />
          <button className={styles.iconBtn} onClick={handleHome} aria-label={t("lobby.home")} title={t("lobby.home")}>
            <HomeIcon />
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className={styles.main}>
        {/* ── Active games banner ── */}
        {activeRooms.length > 0 && (
          <div className={styles.activeGamesSection}>
            <h2 className={styles.activeGamesTitle}>{t("room.activeGames.title")}</h2>
            <ul className={styles.activeGamesList}>
              {activeRooms.map((r) => (
                <li key={r.code} className={styles.activeGameItem}>
                  <div className={styles.activeGameInfo}>
                    <span className={styles.activeGameName}>
                      <span className={styles.activeGameSuits} aria-hidden="true">♠♥♦♣</span>
                      {gameName(r.gameId, lang)}
                    </span>
                    <span className={styles.activeGameMeta}>
                      {t(`room.activeGames.phaseLabel.${r.phase}`)}
                      {" · "}
                      {t(`lobby.variants.${shortVariantKey(r.variantId)}`, shortVariantKey(r.variantId))}
                      {" · "}
                      {t("lobby.playersLabel", { count: r.playerCount })}
                    </span>
                  </div>
                  <button
                    className={styles.rejoinBtn}
                    onClick={() => void navigate(`/room/${r.code}`)}
                  >
                    {t("room.activeGames.rejoin")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.grid}>
          {/* ── Left column: Create + Join ── */}
          <div className={styles.column}>
            {/* Create game */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t("lobby.createGame")}</h2>
              </div>

              {!showCreate ? (
                <button
                  className={styles.primaryBtn}
                  onClick={() => setShowCreate(true)}
                >
                  {t("lobby.createGame")}
                </button>
              ) : (
                <form onSubmit={handleCreate} className={styles.createForm} noValidate>
                  {/* Game — picked from the shared registry */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>{t("lobby.create.game")}</label>
                    {games.length > 1 ? (
                      <div className={styles.chipGroup} role="radiogroup" aria-label={t("lobby.create.game")}>
                        {games.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            role="radio"
                            aria-checked={gameId === g.id}
                            className={`${styles.chip} ${gameId === g.id ? styles.chipSelected : ""}`}
                            onClick={() => selectGame(g.id)}
                          >
                            {g.name[lang] ?? g.name.en}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.gameOption}>
                        <span className={styles.gameOptionSuits} aria-hidden="true">♠♥♦♣</span>
                        <span className={styles.gameOptionName}>{gameDef.name.en} · {gameDef.name.fa}</span>
                      </div>
                    )}
                  </div>

                  {/* Variant */}
                  {gameDef.variants.length > 1 && (
                    <div className={styles.fieldGroup}>
                      <label className={styles.label}>{t("lobby.create.variant")}</label>
                      <div className={styles.chipGroup} role="radiogroup" aria-label={t("lobby.create.variant")}>
                        {gameDef.variants.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={variantId === v.id}
                            className={`${styles.chip} ${variantId === v.id ? styles.chipSelected : ""}`}
                            onClick={() => selectVariant(v.id)}
                          >
                            {t(`lobby.variants.${shortVariantKey(v.id)}`, v.name[lang] ?? v.name.en)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Variant options — rendered generically from the registry */}
                  {(variantDef.options ?? []).map((opt) => {
                    const label = opt.name[lang] ?? opt.name.en;
                    if (opt.type === "number") {
                      const val = Number(options[opt.key]) || 0;
                      const min = opt.min ?? 1;
                      const max = opt.max ?? 99;
                      return (
                        <div key={opt.key} className={styles.fieldGroup}>
                          <label className={styles.label}>{label}</label>
                          <div className={styles.stepper}>
                            <button
                              type="button"
                              className={styles.stepperBtn}
                              onClick={() => setOption(opt.key, Math.max(min, val - 1))}
                              disabled={val <= min}
                              aria-label="−"
                            >−</button>
                            <span className={styles.stepperValue} aria-live="polite">{val}</span>
                            <button
                              type="button"
                              className={styles.stepperBtn}
                              onClick={() => setOption(opt.key, Math.min(max, val + 1))}
                              disabled={val >= max}
                              aria-label="+"
                            >+</button>
                          </div>
                        </div>
                      );
                    }
                    if (opt.type === "boolean") {
                      const on = !!options[opt.key];
                      return (
                        <div key={opt.key} className={styles.fieldGroup}>
                          <label className={styles.label}>{label}</label>
                          <div className={styles.chipGroup} role="radiogroup" aria-label={label}>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={!on}
                              className={`${styles.chip} ${!on ? styles.chipSelected : ""}`}
                              onClick={() => setOption(opt.key, false)}
                            >{t("lobby.create.off")}</button>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={on}
                              className={`${styles.chip} ${on ? styles.chipSelected : ""}`}
                              onClick={() => setOption(opt.key, true)}
                            >{t("lobby.create.on")}</button>
                          </div>
                        </div>
                      );
                    }
                    // choice
                    return (
                      <div key={opt.key} className={styles.fieldGroup}>
                        <label className={styles.label}>{label}</label>
                        <div className={styles.chipGroup} role="radiogroup" aria-label={label}>
                          {(opt.choices ?? []).map((choice) => (
                            <button
                              key={String(choice)}
                              type="button"
                              role="radio"
                              aria-checked={options[opt.key] === choice}
                              className={`${styles.chip} ${options[opt.key] === choice ? styles.chipSelected : ""}`}
                              onClick={() => setOption(opt.key, choice)}
                            >{String(choice)}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Visibility */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>{t("lobby.create.visibility")}</label>
                    <div className={styles.chipGroup} role="radiogroup" aria-label={t("lobby.create.visibility")}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!isPublic}
                        className={`${styles.chip} ${!isPublic ? styles.chipSelected : ""}`}
                        onClick={() => setIsPublic(false)}
                      >
                        {t("lobby.create.private")}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isPublic}
                        className={`${styles.chip} ${isPublic ? styles.chipSelected : ""}`}
                        onClick={() => setIsPublic(true)}
                      >
                        {t("lobby.create.public")}
                      </button>
                    </div>
                  </div>

                  {createError && (
                    <p className={styles.error} role="alert">{createError}</p>
                  )}

                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => { setShowCreate(false); setCreateError(null); }}
                    >
                      ✕
                    </button>
                    <button
                      type="submit"
                      className={styles.primaryBtn}
                      disabled={creating}
                    >
                      {creating ? t("lobby.create.loading") : t("lobby.create.submit")}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Join by code */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t("lobby.joinGame")}</h2>
              </div>

              <form onSubmit={handleJoinSubmit} className={styles.joinForm} noValidate>
                <input
                  className={styles.codeInput}
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setJoinError(null);
                  }}
                  placeholder={t("lobby.joinCodePlaceholder")}
                  maxLength={6}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label={t("lobby.joinGame")}
                  disabled={joining}
                />
                {joinError && (
                  <p className={styles.error} role="alert">{joinError}</p>
                )}
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={joining || joinCode.trim().length < 6}
                >
                  {joining ? "…" : t("lobby.join")}
                </button>
              </form>
            </div>
          </div>

          {/* ── Right column: Public rooms + Friends ── */}
          <div className={`${styles.column} ${styles.columnWide}`}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t("lobby.publicRooms")}</h2>
                <button
                  className={styles.iconBtn}
                  onClick={() => fetchRooms()}
                  disabled={loadingRooms}
                  aria-label={t("lobby.refresh")}
                  title={t("lobby.refresh")}
                >
                  <RefreshIcon />
                </button>
              </div>

              {loadingRooms ? (
                <div className={styles.roomsLoading}>
                  <div className={styles.spinner} aria-hidden="true" />
                </div>
              ) : rooms.length === 0 ? (
                <p className={styles.emptyMsg}>{t("lobby.noPublicRooms")}</p>
              ) : (
                <ul className={styles.roomList} aria-label={t("lobby.publicRooms")}>
                  {rooms.map((room) => (
                    <li key={room.code} className={styles.roomItem}>
                      <div className={styles.roomInfo}>
                        <span className={styles.roomGame}>
                          <span className={styles.roomSuits} aria-hidden="true">♠♥♦♣</span>
                          {gameName(room.gameId, lang)}
                        </span>
                        <span className={styles.roomMeta}>
                          {t(`lobby.variants.${shortVariantKey(room.variantId)}`, shortVariantKey(room.variantId))}
                          {" · "}
                          {t("lobby.hostLabel")}: {room.hostNickname}
                          {" · "}
                          {t("lobby.playersLabel", { count: room.playerCount })}
                        </span>
                      </div>
                      <button
                        className={styles.joinBtn}
                        onClick={() => handleJoin(room.code)}
                        disabled={joining}
                      >
                        {t("lobby.joinRoomBtn")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Friends panel */}
            <div className={styles.card}>
              <FriendsPanel
                onInviteToJoin={(roomCode, fromName) =>
                  setFriendInvite({ roomCode, fromName })
                }
              />
            </div>
          </div>
        </div>
      </main>

      {/* Friend invite toast */}
      {friendInvite && (
        <div className={styles.inviteToast} role="alertdialog" aria-label={t("friends.invite.title")}>
          <p className={styles.inviteMsg}>
            {t("friends.invite.message", { name: friendInvite.fromName })}
          </p>
          <div className={styles.inviteActions}>
            <button className={styles.inviteDismiss} onClick={() => setFriendInvite(null)}>
              {t("friends.invite.dismiss")}
            </button>
            <button
              className={styles.inviteJoin}
              onClick={() => {
                void navigate(`/room/${friendInvite.roomCode}`);
                setFriendInvite(null);
              }}
            >
              {t("friends.invite.join")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
