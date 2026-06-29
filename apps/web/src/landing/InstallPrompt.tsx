import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  canPromptInstall,
  detectPlatform,
  isInstalled,
  promptInstall,
  subscribeInstall,
  type InstallPlatform,
} from "./pwa-install";
import styles from "./InstallPrompt.module.css";

interface InstallPromptProps {
  open: boolean;
  onClose: () => void;
}

const PLATFORMS: InstallPlatform[] = ["ios", "android", "desktop"];
const STEP_KEYS = ["s1", "s2", "s3"] as const;

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" /><path d="m8 8 4-4 4 4" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function InstallPrompt({ open, onClose }: InstallPromptProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  // Re-render when install availability changes (event may arrive after mount).
  const installable = useSyncExternalStore(subscribeInstall, canPromptInstall);
  const installed = useSyncExternalStore(subscribeInstall, isInstalled);

  useEffect(() => {
    if (open) setPlatform(detectPlatform());
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) onClose();
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label={t("install.close")}>✕</button>

        <h2 id="install-title" className={styles.title}>{t("install.title")}</h2>
        <p className={styles.subtitle}>{t("install.subtitle")}</p>

        {installed ? (
          <div className={styles.installedNote}>{t("install.installed")}</div>
        ) : (
          <>
            {/* Programmatic install (Chrome/Edge/Android) when the browser offers it. */}
            {installable && (
              <button className={styles.installBtn} onClick={() => void handleInstall()}>
                <DownloadIcon />
                {t("install.button")}
              </button>
            )}

            {/* Platform tabs for manual instructions. */}
            <div className={styles.tabs} role="tablist" aria-label={t("install.title")}>
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={platform === p}
                  className={`${styles.tab} ${platform === p ? styles.tabActive : ""}`}
                  onClick={() => setPlatform(p)}
                >
                  {t(`install.${p}.tab`)}
                </button>
              ))}
            </div>

            <div className={styles.steps}>
              <h3 className={styles.stepsTitle}>
                {platform === "ios" && <ShareIcon />}
                {t(`install.${platform}.title`)}
              </h3>
              <ol className={styles.stepList}>
                {STEP_KEYS.map((s) => (
                  <li key={s} className={styles.step}>{t(`install.${platform}.${s}`)}</li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
