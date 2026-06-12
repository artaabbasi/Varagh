import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MatchHistoryEntry } from "@varagh/shared";
import { socket } from "../app/socket";
import { getStoredUser, storeUser, clearToken, type StoredUser } from "../auth/auth-store";
import { useTheme } from "../theme/ThemeProvider";
import { compressImage } from "./compressImage";
import styles from "./ProfileScreen.module.css";

const NICKNAME_RE = /^[؀-ۿa-zA-Z0-9 ]{2,20}$/;

type Status = { kind: "ok" | "err"; text: string } | null;

const PW_ERROR_KEYS: Record<string, string> = {
  wrong_password: "profile.edit.error.wrongPassword",
  short_password: "profile.edit.error.shortPassword",
};
const AVATAR_ERROR_KEYS: Record<string, string> = {
  image_too_large: "profile.edit.error.imageTooLarge",
  invalid_image: "profile.edit.error.invalidImage",
};

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

  const [user, setUser] = useState<StoredUser | null>(getStoredUser());
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Edit state ───────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false);
  const [displayName, setDisplayName] = useState(user?.nickname ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameStatus, setNameStatus] = useState<Status>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState<Status>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<Status>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const applyUser = (u: StoredUser) => {
    storeUser(u);
    setUser(u);
  };

  const handleLogout = () => {
    clearToken();
    void navigate("/");
  };

  const handleSaveName = () => {
    const trimmed = displayName.trim();
    if (!NICKNAME_RE.test(trimmed)) {
      setNameStatus({ kind: "err", text: t("profile.edit.error.invalidNickname") });
      return;
    }
    setNameBusy(true);
    setNameStatus(null);
    socket.emit("user:updateDisplayName", { displayName: trimmed }, (res) => {
      setNameBusy(false);
      if (!res.ok) {
        setNameStatus({ kind: "err", text: t("profile.edit.error.generic") });
        return;
      }
      applyUser(res.user);
      setNameStatus({ kind: "ok", text: t("profile.edit.saved") });
    });
  };

  const handleChangePassword = () => {
    if (newPw.length < 4) {
      setPwStatus({ kind: "err", text: t("profile.edit.error.shortPassword") });
      return;
    }
    if (newPw !== confirmPw) {
      setPwStatus({ kind: "err", text: t("profile.edit.error.passwordMismatch") });
      return;
    }
    setPwBusy(true);
    setPwStatus(null);
    socket.emit("user:changePassword", { currentPassword: currentPw, newPassword: newPw }, (res) => {
      setPwBusy(false);
      if (!res.ok) {
        setPwStatus({ kind: "err", text: t(PW_ERROR_KEYS[res.error] ?? "profile.edit.error.generic") });
        return;
      }
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwStatus({ kind: "ok", text: t("profile.edit.passwordChanged") });
    });
  };

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    setAvatarStatus(null);
    try {
      const dataUrl = await compressImage(file);
      socket.emit("user:updateAvatar", { avatar: dataUrl }, (res) => {
        setAvatarBusy(false);
        if (!res.ok) {
          setAvatarStatus({ kind: "err", text: t(AVATAR_ERROR_KEYS[res.error] ?? "profile.edit.error.generic") });
          return;
        }
        applyUser(res.user);
      });
    } catch {
      setAvatarBusy(false);
      setAvatarStatus({ kind: "err", text: t("profile.edit.error.invalidImage") });
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarBusy(true);
    setAvatarStatus(null);
    socket.emit("user:updateAvatar", { avatar: null }, (res) => {
      setAvatarBusy(false);
      if (res.ok) applyUser(res.user);
    });
  };

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
            {user?.avatar ? (
              <img src={user.avatar} alt="" className={styles.avatarImg} />
            ) : (
              user?.nickname?.slice(0, 1).toUpperCase() ?? "?"
            )}
          </div>
          <div className={styles.userInfo}>
            <h1 className={styles.userName}>
              {user?.nickname ?? "—"}
              <span className={styles.disc}>#{user?.discriminator}</span>
            </h1>
            <p className={styles.userSub}>{user?.username ? `@${user.username}` : t("profile.player")}</p>
          </div>
          <div className={styles.cardActions}>
            <button
              className={styles.editBtn}
              onClick={() => { setShowEdit((v) => !v); setDisplayName(user?.nickname ?? ""); }}
              aria-expanded={showEdit}
            >
              <EditIcon />
              <span className={styles.editLabel}>{t("profile.edit.title")}</span>
            </button>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <LogoutIcon />
              <span className={styles.logoutLabel}>{t("profile.logout")}</span>
            </button>
          </div>
        </div>

        {/* ── Edit panel ── */}
        {showEdit && (
          <div className={styles.editPanel}>
            {/* Avatar */}
            <div className={styles.editAvatarRow}>
              <div className={styles.editAvatar}>
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className={styles.avatarImg} />
                ) : (
                  user?.nickname?.slice(0, 1).toUpperCase() ?? "?"
                )}
              </div>
              <div className={styles.editAvatarActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => { void handleAvatarFile(e.target.files?.[0]); e.target.value = ""; }}
                />
                <button
                  className={styles.secondaryBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? "…" : t("profile.edit.changePhoto")}
                </button>
                {user?.avatar && (
                  <button className={styles.linkBtn} onClick={handleRemoveAvatar} disabled={avatarBusy}>
                    {t("profile.edit.removePhoto")}
                  </button>
                )}
                {avatarStatus && (
                  <p className={avatarStatus.kind === "ok" ? styles.statusOk : styles.statusErr}>{avatarStatus.text}</p>
                )}
              </div>
            </div>

            {/* Display name */}
            <div className={styles.editField}>
              <label className={styles.editLabelText} htmlFor="edit-displayname">{t("profile.edit.displayName")}</label>
              <div className={styles.editRow}>
                <input
                  id="edit-displayname"
                  className={styles.input}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={20}
                />
                <button className={styles.primaryBtn} onClick={handleSaveName} disabled={nameBusy}>
                  {nameBusy ? "…" : t("profile.edit.save")}
                </button>
              </div>
              {nameStatus && (
                <p className={nameStatus.kind === "ok" ? styles.statusOk : styles.statusErr}>{nameStatus.text}</p>
              )}
            </div>

            {/* Password */}
            <div className={styles.editField}>
              <label className={styles.editLabelText}>{t("profile.edit.password")}</label>
              <input
                className={styles.input}
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder={t("profile.edit.currentPassword")}
                autoComplete="current-password"
              />
              <input
                className={styles.input}
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder={t("profile.edit.newPassword")}
                autoComplete="new-password"
              />
              <input
                className={styles.input}
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder={t("profile.edit.confirmPassword")}
                autoComplete="new-password"
              />
              <button
                className={styles.primaryBtn}
                onClick={handleChangePassword}
                disabled={pwBusy || !currentPw || !newPw || !confirmPw}
              >
                {pwBusy ? "…" : t("profile.edit.changePassword")}
              </button>
              {pwStatus && (
                <p className={pwStatus.kind === "ok" ? styles.statusOk : styles.statusErr}>{pwStatus.text}</p>
              )}
            </div>
          </div>
        )}

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

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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
