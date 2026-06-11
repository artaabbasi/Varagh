import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { socket } from "../app/socket";
import { storeToken } from "./auth-store";
import styles from "./SignupScreen.module.css";

// 2–20 chars: Persian (U+0600–U+06FF) or Latin letters, digits, spaces
const NICKNAME_RE = /^[؀-ۿa-zA-Z0-9 ]{2,20}$/;

export function SignupScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!NICKNAME_RE.test(trimmed)) {
      setError(t("auth.signup.error.invalidNickname"));
      return;
    }
    setLoading(true);
    setError(null);
    if (!socket.connected) socket.connect();
    socket.emit("auth:signup", { nickname: trimmed }, (res) => {
      setLoading(false);
      if (!res.ok) {
        setError(t("auth.signup.error.serverError"));
        return;
      }
      storeToken(res.token);
      void navigate("/lobby");
    });
  };

  const isSubmittable = !loading && NICKNAME_RE.test(nickname.trim());

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("auth.signup.title")}</h1>
        <p className={styles.subtitle}>{t("auth.signup.subtitle")}</p>
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
              aria-describedby="nickname-help"
            />
            <p id="nickname-help" className={styles.help}>
              {t("auth.signup.nicknameHelp")}
            </p>
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
      </div>
    </div>
  );
}
