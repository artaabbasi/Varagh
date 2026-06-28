import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STICKERS, STICKER_COOLDOWN_MS } from "@varagh/shared";
import { socket } from "../../app/socket";
import { playSound } from "../../app/sound";
import { StickerArt } from "../../components/stickers/StickerArt";
import styles from "./StickerWheel.module.css";

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <path
        d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StickerWheel() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as "fa" | "en") === "fa" ? "fa" : "en";
  const [open, setOpen] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);

  const remaining = Math.max(0, cooldownUntil - now);
  const onCooldown = remaining > 0;

  // Tick only while a cooldown is counting down.
  useEffect(() => {
    if (!onCooldown) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [onCooldown]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const send = (stickerId: string) => {
    if (onCooldown) return;
    socket.emit("room:sticker", { stickerId }, (res) => {
      if (res.ok) {
        playSound("sticker");
        setCooldownUntil(Date.now() + STICKER_COOLDOWN_MS);
        setNow(Date.now());
      }
    });
    setOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div className={styles.panel} role="menu" aria-label={t("stickers.title")}>
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className={styles.sticker}
              onClick={() => send(s.id)}
              disabled={onCooldown}
              aria-label={s.label[lang]}
              title={s.label[lang]}
            >
              <StickerArt id={s.id} size={44} />
              <span className={styles.stickerLabel}>{s.label[lang]}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("stickers.open")}
      >
        {onCooldown ? (
          <span className={styles.cooldown} aria-hidden="true">
            {Math.ceil(remaining / 1000)}
          </span>
        ) : (
          <ChatIcon />
        )}
      </button>
    </div>
  );
}
