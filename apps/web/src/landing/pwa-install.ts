/**
 * PWA install helper.
 *
 * The browser fires `beforeinstallprompt` once, early in page load — often
 * before any React component mounts — so we capture it at module-evaluation
 * time (this module is imported statically by the landing page) and expose a
 * tiny store the UI can subscribe to. Browsers that don't support programmatic
 * install (notably iOS Safari) never fire the event; the UI falls back to the
 * manual "Add to Home Screen" instructions in that case.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's mini-infobar so we can trigger the prompt from our own UI.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export type InstallPlatform = "ios" | "android" | "desktop";

/** Best-effort platform guess for showing the right manual instructions. */
export function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Macintosh but has a touch screen.
  const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isIpadOs) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** True once the app is running as an installed PWA (standalone display). */
export function isInstalled(): boolean {
  if (installed) return true;
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari exposes a non-standard `navigator.standalone`.
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

/** True when the browser offered us a programmatic install prompt. */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Trigger the native install prompt. Returns true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit();
  return choice.outcome === "accepted";
}

/** Subscribe to install-availability changes (for useSyncExternalStore). */
export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
