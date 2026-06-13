/**
 * Trick-resolution animation timeline (milliseconds).
 *
 * When the last card of a trick lands, we don't award the point instantly.
 * Instead:
 *   1. REVIEW  — all cards sit in the centre so everyone sees the full trick.
 *   2. SWEEP   — the cards fly to the winning seat.
 *   3. The trick count (the "point") is revealed as the sweep finishes.
 *
 * These constants are shared by HokmGame (drives the sweep), TrickArea (holds
 * the cards on screen) and HokmTable (delays the trick-count reveal) so the
 * three stay in lock-step.
 */
export const TRICK_REVIEW_MS = 1000;
export const TRICK_SWEEP_MS = 600;

/** How long the completed trick stays on screen before it is cleared. */
export const TRICK_HOLD_MS = TRICK_REVIEW_MS + TRICK_SWEEP_MS + 50;

/** When the winner's trick count ticks up — just as the cards arrive. */
export const POINT_DELAY_MS = TRICK_REVIEW_MS + TRICK_SWEEP_MS - 120;
