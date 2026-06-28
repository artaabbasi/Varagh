import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isSoundEnabled, setSoundEnabled, subscribeSound } from "../app/sound";

/** Reactive accessor for the global sound-on flag. */
export function useSoundEnabled(): boolean {
  const [on, setOn] = useState(isSoundEnabled());
  useEffect(() => subscribeSound(setOn), []);
  return on;
}

function SpeakerOnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface SoundToggleProps {
  className?: string;
}

export function SoundToggle({ className }: SoundToggleProps) {
  const { t } = useTranslation();
  const on = useSoundEnabled();
  return (
    <button
      type="button"
      className={className}
      onClick={() => setSoundEnabled(!on)}
      aria-pressed={on}
      aria-label={on ? t("sound.mute") : t("sound.unmute")}
      title={on ? t("sound.mute") : t("sound.unmute")}
    >
      {on ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );
}
