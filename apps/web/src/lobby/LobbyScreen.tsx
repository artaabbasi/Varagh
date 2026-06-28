import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LobbyEntry, ActiveRoomEntry } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredUser } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import { SoundToggle } from "../components/SoundToggle";
import { FriendsPanel } from "./FriendsPanel";
import styles from "./LobbyScreen.module.css";

type Variant = "4p" | "3p" | "2p";

const VARIANTS: Variant[] = ["4p", "3p", "2p"];

const VARIANT_ID: Record<Variant, string> = {
  "4p": "hokm-4p",
  "3p": "hokm-3p",
  "2p": "hokm-2p",
};
const JOIN_CODE_RE = /^[A-Za-z]{6}$/;

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="12 8 12 12 14 14" />
      <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
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

export function LobbyScreen() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const isRtl = i18n.language === "fa";

  const user = getStoredUser();

  // ── Create game state ────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [variant, setVariant] = useState<Variant>("4p");
  const [isPublic, setIsPublic] = useState(false);
  const [targetScore, setTargetScore] = useState(7);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const fetchRooms = useCallback(() => {
    setLoadingRooms(true);
    socket.emit("room:list", {}, (res) => {
      setLoadingRooms(false);
      if (res.ok) setRooms(res.rooms);
    });
  }, []);

  useEffect(() => {
    fetchRooms();
    socket.emit("user:getActiveRooms", {}, (res) => {
      if (res.ok) setActiveRooms(res.rooms);
    });
  }, [fetchRooms]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    socket.emit(
      "room:create",
      { gameId: "hokm", variantId: VARIANT_ID[variant], options: { targetScore }, isPublic },
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
        <span className={styles.logo} aria-label="Varagh">ورق</span>

        <div className={styles.userInfo}>
          {user && (
            <>
              <span className={styles.nickname}>{user.nickname}</span>
              <span className={styles.discriminator}>#{user.discriminator}</span>
            </>
          )}
        </div>

        <div className={styles.topActions}>
          <Link to="/profile" className={styles.iconBtn} aria-label="Profile / History">
            <HistoryIcon />
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
          <button className={styles.ghostBtn} onClick={handleHome}>
            {t("lobby.home")}
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
                      Hokm · حکم
                    </span>
                    <span className={styles.activeGameMeta}>
                      {t(`room.activeGames.phaseLabel.${r.phase}`)}
                      {" · "}
                      {t(`lobby.variants.${(r.variantId.replace(/^hokm-/, "") as "4p" | "3p" | "2p") || r.variantId}`)}
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
                  {/* Game (only Hokm for now) */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>{t("lobby.create.game")}</label>
                    <div className={styles.gameOption}>
                      <span className={styles.gameOptionSuits} aria-hidden="true">♠♥♦♣</span>
                      <span className={styles.gameOptionName}>Hokm · حکم</span>
                    </div>
                  </div>

                  {/* Variant */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>{t("lobby.create.variant")}</label>
                    <div className={styles.chipGroup} role="radiogroup" aria-label={t("lobby.create.variant")}>
                      {VARIANTS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={variant === v}
                          className={`${styles.chip} ${variant === v ? styles.chipSelected : ""}`}
                          onClick={() => setVariant(v)}
                        >
                          {t(`lobby.variants.${v}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Points to win */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>{t("lobby.create.targetScore")}</label>
                    <div className={styles.stepper}>
                      <button
                        type="button"
                        className={styles.stepperBtn}
                        onClick={() => setTargetScore((s) => Math.max(1, s - 1))}
                        disabled={targetScore <= 1}
                        aria-label={t("lobby.create.targetScoreDec")}
                      >
                        −
                      </button>
                      <span className={styles.stepperValue} aria-live="polite">{targetScore}</span>
                      <button
                        type="button"
                        className={styles.stepperBtn}
                        onClick={() => setTargetScore((s) => Math.min(13, s + 1))}
                        disabled={targetScore >= 13}
                        aria-label={t("lobby.create.targetScoreInc")}
                      >
                        +
                      </button>
                    </div>
                    <p className={styles.stepperHint}>{t("lobby.create.targetScoreHint")}</p>
                  </div>

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
                  onClick={fetchRooms}
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
                          Hokm · حکم
                        </span>
                        <span className={styles.roomMeta}>
                          {t(`lobby.variants.${(room.variantId.replace(/^hokm-/, "") as Variant) || room.variantId}`)}
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
