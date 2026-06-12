import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { socket } from "../app/socket";
import { storeToken, storeUser } from "./auth-store";
import styles from "./SignupScreen.module.css";

export function SignInScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !password) return;
    setLoading(true);
    setError(null);
    if (!socket.connected) socket.connect();
    socket.emit(
      "auth:loginWithPassword",
      { nickname: nickname.trim(), password },
      (res) => {
        setLoading(false);
        if (!res.ok) {
          setError(t("auth.signin.error.invalidCredentials"));
          return;
        }
        storeToken(res.token);
        storeUser(res.user);
        void navigate("/lobby");
      },
    );
  };

  const isSubmittable = !loading && nickname.trim().length >= 2 && password.length >= 4;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <a href="/" className={styles.backLogo} aria-label="Back to home">ورق</a>
        <h1 className={styles.title}>{t("auth.signin.title")}</h1>
        <p className={styles.subtitle}>{t("auth.signin.subtitle")}</p>
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("auth.signup.nicknamePlaceholder")}
              maxLength={20}
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <div className={styles.passwordRow}>
              <input
                className={styles.input}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.signin.passwordPlaceholder")}
                disabled={loading}
                autoComplete="current-password"
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
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.submit} type="submit" disabled={!isSubmittable}>
            {loading ? t("auth.signup.loading") : t("auth.signin.submit")}
          </button>
        </form>

        <p className={styles.switchLink}>
          {t("auth.signin.noAccount")}{" "}
          <Link to="/signup">{t("auth.signin.signUpLink")}</Link>
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
