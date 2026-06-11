/**
 * TurnTimer is intentionally not a standalone overlay component.
 * The countdown ring is embedded directly into OpponentSeat and LocalHand
 * so it sits naturally within each seat's layout. This file is kept as
 * a barrel re-export for any future standalone usage.
 */
export { CountdownRing as TurnTimer } from "../../components/CountdownRing";
