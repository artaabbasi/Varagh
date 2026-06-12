import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { socket } from "../app/socket";
import { storeToken, storeUser } from "./auth-store";
import styles from "./SignupScreen.module.css";

// 2–20 chars: Persian (U+0600–U+06FF) or Latin letters, digits, spaces
const NICKNAME_RE = /^[؀-ۿa-zA-Z0-9 ]{2,20}$/;
// Username: 3–20 chars, must start with a letter, then letters/digits/underscore
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

const SIGNUP_ERROR_KEYS: Record<string, string> = {
  invalid_username: "auth.signup.error.invalidUsername",
  invalid_nickname: "auth.signup.error.invalidNickname",
  short_password: "auth.signup.error.shortPassword",
  username_taken: "auth.signup.error.usernameTaken",
};

export function SignupScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const uname = username.trim().toLowerCase();
    const display = nickname.trim();
    if (!USERNAME_RE.test(uname)) {
      setError(t("auth.signup.error.invalidUsername"));
      return;
    }
    if (!NICKNAME_RE.test(display)) {
      setError(t("auth.signup.error.invalidNickname"));
      return;
    }
    if (password.length < 4) {
      setError(t("auth.signup.error.shortPassword"));
      return;
    }
    setLoading(true);
    setError(null);
    if (!socket.connected) socket.connect();
    socket.emit(
      "auth:signup",
      { username: uname, displayName: display, password },
      (res) => {
        setLoading(false);
        if (!res.ok) {
          const key = SIGNUP_ERROR_KEYS[res.error] ?? "auth.signup.error.serverError";
          setError(t(key));
          return;
        }
        storeToken(res.token);
        storeUser(res.user);
        void navigate("/lobby");
      },
    );
  };

  const isSubmittable =
    !loading &&
    USERNAME_RE.test(username.trim().toLowerCase()) &&
    NICKNAME_RE.test(nickname.trim()) &&
    password.length >= 4;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <a href="/" className={styles.backLogo} aria-label="Back to home">ورق</a>
        <h1 className={styles.title}>{t("auth.signup.title")}</h1>
        <p className={styles.subtitle}>{t("auth.signup.subtitle")}</p>
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("auth.signup.usernamePlaceholder")}
              maxLength={20}
              autoFocus
              disabled={loading}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="username-help"
            />
            <p id="username-help" className={styles.help}>
              {t("auth.signup.usernameHelp")}
            </p>
          </div>

          <div className={styles.field}>
            <input
              className={styles.input}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("auth.signup.nicknamePlaceholder")}
              maxLength={20}
              disabled={loading}
              aria-describedby="nickname-help"
            />
            <p id="nickname-help" className={styles.help}>
              {t("auth.signup.nicknameHelp")}
            </p>
          </div>

          <div className={styles.field}>
            <div className={styles.passwordRow}>
              <input
                className={styles.input}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.signup.passwordPlaceholder")}
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("auth.signup.hidePassword") : t("auth.signup.showPassword")}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <p className={styles.help}>{t("auth.signup.passwordHelp")}</p>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} type="submit" disabled={!isSubmittable}>
            {loading ? t("auth.signup.loading") : t("auth.signup.submit")}
          </button>
        </form>

        <p className={styles.switchLink}>
          {t("auth.signup.haveAccount")}{" "}
          <Link to="/signin">{t("auth.signup.signInLink")}</Link>
        </p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
