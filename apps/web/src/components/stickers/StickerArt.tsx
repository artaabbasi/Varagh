/**
 * Custom SVG illustrations for chat stickers — one glyph per sticker id.
 * Each renders on a tinted rounded badge so the set reads as a cohesive,
 * playful family rather than clip-art. No emoji, no text inside the art
 * (labels are rendered separately and localized).
 */

interface StickerArtProps {
  id: string;
  size?: number;
}

// Tone tints (sit on the badge background); foreground glyphs are white.
const BADGE: Record<string, string> = {
  gg: "#7c4dff",
  "bring-it": "#e53935",
  fire: "#fb8c00",
  nice: "#ffb300",
  "good-luck": "#43a047",
  thanks: "#ec407a",
  hello: "#29b6f6",
  haha: "#ffca28",
  "thumbs-up": "#26a69a",
};

function Glyph({ id }: { id: string }) {
  switch (id) {
    case "gg": // rosette / award ribbon
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
          <circle cx="24" cy="20" r="9" fill="#fff" fillOpacity="0.18" />
          <path d="M19 27l-3 11 8-4 8 4-3-11" fill="#fff" fillOpacity="0.18" />
          <path d="M24 15v10M19.5 20h9" />
        </g>
      );
    case "bring-it": // crossed swords
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 14l16 16M34 14L18 30" />
          <path d="M12 30l4 4M36 30l-4 4" />
        </g>
      );
    case "fire": // flame
      return (
        <path
          d="M24 8c2 6-4 7-4 13 0 3 2 5 4 5s4-2 4-5c2 2 3 4 3 7a7 7 0 1 1-14 0c0-8 7-10 7-20z"
          fill="#fff"
        />
      );
    case "nice": // sparkle star
      return (
        <path
          d="M24 10l3.2 9.2L37 22l-9.8 2.8L24 34l-3.2-9.2L11 22l9.8-2.8z"
          fill="#fff"
        />
      );
    case "good-luck": // four-leaf clover
      return (
        <g fill="#fff">
          <circle cx="19" cy="19" r="6" />
          <circle cx="29" cy="19" r="6" />
          <circle cx="19" cy="29" r="6" />
          <circle cx="29" cy="29" r="6" />
          <rect x="23" y="28" width="2.4" height="9" rx="1.2" />
        </g>
      );
    case "thanks": // heart
      return (
        <path
          d="M24 34s-11-6.6-11-14a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 7.4-11 14-11 14z"
          fill="#fff"
        />
      );
    case "hello": // waving hand
      return (
        <g fill="#fff">
          <rect x="18" y="14" width="3.2" height="16" rx="1.6" />
          <rect x="22.4" y="12" width="3.2" height="18" rx="1.6" />
          <rect x="26.8" y="14" width="3.2" height="16" rx="1.6" />
          <path d="M16 24c-1 4 1 9 5 11 5 2 10-1 11-6l1-4c.4-1.6-1.8-2.4-2.5-.8L29 28l-13-4z" />
        </g>
      );
    case "haha": // laughing face
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
          <circle cx="24" cy="24" r="13" />
          <path d="M18 20l3 2-3 2M30 20l-3 2 3 2" />
          <path d="M17 28a7 7 0 0 0 14 0z" fill="#fff" stroke="none" />
        </g>
      );
    case "thumbs-up": // thumbs up
      return (
        <g fill="#fff">
          <path d="M14 22h4v14h-4z" />
          <path d="M20 22l5-9c1.6-2.6 5 .2 4 3l-1 4h7c2 0 3.4 1.8 3 3.8l-2 8c-.4 1.8-2 3.2-4 3.2H20z" />
        </g>
      );
    default:
      return <circle cx="24" cy="24" r="10" fill="#fff" />;
  }
}

export function StickerArt({ id, size = 48 }: StickerArtProps) {
  const bg = BADGE[id] ?? "#7c4dff";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="14" fill={bg} />
      <Glyph id={id} />
    </svg>
  );
}
