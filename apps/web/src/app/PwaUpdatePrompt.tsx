import { useRegisterSW } from "virtual:pwa-register/react";
import { useTranslation } from "react-i18next";
import styles from "./PwaUpdatePrompt.module.css";

/**
 * How often (ms) to ask the browser to check for a newer service worker while
 * the app stays open. An installed PWA can be left open for days, so polling
 * surfaces updates without requiring a fresh page load.
 */
const UPDATE_CHECK_INTERVAL_MS = 60_000;

/**
 * Shows a banner when a new build has been deployed and lets the user apply it.
 *
 * How it works:
 *  - The build emits a service worker that precaches the app shell.
 *  - On each page load (and every UPDATE_CHECK_INTERVAL_MS while open) the
 *    browser fetches the new SW. When its precache manifest differs from the
 *    running one, the new SW installs but *waits* (registerType: "prompt").
 *  - `useRegisterSW` flips `needRefresh` to true at that point, so we render
 *    the banner. Clicking "Update" calls `updateServiceWorker(true)`, which
 *    tells the waiting SW to activate (skipWaiting) and reloads the page onto
 *    the new version.
 */
export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        // Skip the check when the tab is hidden to avoid pointless network use.
        if (!document.hidden) void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className={styles.toast} role="alert" aria-live="polite">
      <span className={styles.msg}>{t("pwa.updateAvailable")}</span>
      <div className={styles.actions}>
        <button className={styles.later} onClick={() => setNeedRefresh(false)}>
          {t("pwa.later")}
        </button>
        <button className={styles.reload} onClick={() => void updateServiceWorker(true)}>
          {t("pwa.reload")}
        </button>
      </div>
    </div>
  );
}
