/**
 * Trick-resolution animation timeline (ms) — mirrors Hokm's timing so the
 * Shelem table feels identical: REVIEW (cards held in the centre) → SWEEP
 * (cards fly to the winner's seat) → the trick count ticks up as they arrive.
 */
export const TRICK_REVIEW_MS = 1000;
export const TRICK_SWEEP_MS = 600;
export const TRICK_HOLD_MS = TRICK_REVIEW_MS + TRICK_SWEEP_MS + 50;
export const POINT_DELAY_MS = TRICK_REVIEW_MS + TRICK_SWEEP_MS - 120;
