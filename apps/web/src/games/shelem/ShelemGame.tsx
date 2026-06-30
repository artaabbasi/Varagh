import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Card, GameEvent, ShelemMove, ShelemView } from "@varagh/shared";
import { shelemLegalPlays, shelemMaxBid, SHELEM_BID_STEP } from "@varagh/shared";
import { socket } from "../../app/socket";
import { playSound } from "../../app/sound";
import { PlayingCard } from "../../components/PlayingCard";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { CardLoadingScreen } from "../../components/CardLoadingScreen";
import { CountdownRing } from "../../components/CountdownRing";
import { TrickPile } from "../../components/TrickPile";
import { StickerWheel } from "../hokm/StickerWheel";
import { StickerBubble } from "../../components/stickers/StickerBubble";
import { OpponentSeat } from "../hokm/OpponentSeat";
import { WaitingRoom } from "../hokm/WaitingRoom";
import { useShelemSocket } from "./useShelemSocket";
import styles from "./ShelemGame.module.css";

const TURN_SECONDS = 30;
const SUIT_SYMBOL: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };

type Room = ReturnType<typeof useShelemSocket>["room"];
const cardKey = (c: Card) => `${c.rank}-${c.suit}`;

function seatOf(room: Room, playerId: string) {
  return room?.seats.find((s) => s.playerId === playerId);
}
function nameOf(room: Room, playerId: string): string {
  return seatOf(room, playerId)?.nickname ?? playerId.slice(0, 6);
}
function avatarOf(room: Room, playerId: string): string | null {
  return seatOf(room, playerId)?.avatar ?? null;
}
function discOf(room: Room, playerId: string): string {
  return seatOf(room, playerId)?.discriminator ?? "";
}
function connectedOf(room: Room, playerId: string): boolean {
  return seatOf(room, playerId)?.connected ?? true;
}

interface RoundOverData {
  hakemTeam: number;
  contractBid: number | null;
  contractIsShelem: boolean;
  made: number[];
  delta: number[];
  contractMade: boolean;
  scores: number[];
}

export function ShelemGame() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { view, room, events, sendMove, moveError, clearMoveError } = useShelemSocket();

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [ended, setEnded] = useState<{ reason: "playerLeft" | "hostEnded"; by: string | null } | null>(null);
  const [roundFlash, setRoundFlash] = useState<RoundOverData | null>(null);
  const [trumpFlash, setTrumpFlash] = useState<string | null>(null);
  const [bidValue, setBidValue] = useState(SHELEM_BID_STEP);
  const [discardSel, setDiscardSel] = useState<Card[]>([]);
  const [stickers, setStickers] = useState<Record<string, { id: string; nonce: number }>>({});
  const stickerNonceRef = useRef(0);
  const stickerTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Join (or rejoin) on mount — RoomRouter owns active-room registration.
  useEffect(() => {
    if (!code) return;
    socket.emit("room:join", { joinCode: code.toUpperCase() }, (res) => {
      if (!res.ok) void navigate("/lobby");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const onAborted = (data: { reason: "playerLeft" | "hostEnded"; by: string | null }) => setEnded(data);
    socket.on("game:aborted", onAborted);
    return () => { socket.off("game:aborted", onAborted); };
  }, []);

  // Stickers from anyone in the room (including our own echo).
  useEffect(() => {
    const onSticker = ({ from, stickerId }: { from: string; stickerId: string }) => {
      const nonce = ++stickerNonceRef.current;
      setStickers((prev) => ({ ...prev, [from]: { id: stickerId, nonce } }));
      playSound("sticker");
      if (stickerTimersRef.current[from]) clearTimeout(stickerTimersRef.current[from]);
      stickerTimersRef.current[from] = setTimeout(() => {
        setStickers((prev) => {
          if (prev[from]?.nonce !== nonce) return prev;
          const next = { ...prev };
          delete next[from];
          return next;
        });
      }, 4000);
    };
    socket.on("room:sticker", onSticker);
    const timers = stickerTimersRef.current;
    return () => {
      socket.off("room:sticker", onSticker);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Sound + round/trump feedback from the event stream.
  const lastEventRef = useRef<GameEvent[]>([]);
  useEffect(() => {
    if (events === lastEventRef.current) return;
    lastEventRef.current = events;
    for (const e of events) {
      if (e.type === "cardPlayed") playSound("playCard");
      else if (e.type === "trickWon") playSound("trickWin");
      else if (e.type === "bidPlaced" || e.type === "passed") playSound("turnTick");
      else if (e.type === "trumpSet") {
        const suit = (e.data as { suit: string }).suit;
        playSound("trumpChosen");
        setTrumpFlash(suit);
        setTimeout(() => setTrumpFlash(null), 2000);
      } else if (e.type === "roundOver") {
        playSound("trickWin");
        setRoundFlash(e.data as RoundOverData);
      } else if (e.type === "gameOver") playSound("gameWin");
    }
  }, [events]);

  // Reset the discard selection whenever we leave the exchange.
  useEffect(() => {
    if (view?.phase !== "zaminExchange") setDiscardSel([]);
  }, [view?.phase]);

  const myTurn = !!view && view.currentTurn === view.forPlayer;

  // Reset the bid stepper to the current legal floor each time it's our bid.
  const biddingFloor = view && view.phase === "bidding"
    ? (view.highBid === null ? SHELEM_BID_STEP : view.highBid + SHELEM_BID_STEP)
    : SHELEM_BID_STEP;
  useEffect(() => {
    setBidValue(biddingFloor);
  }, [biddingFloor, myTurn]);

  // Local 30s turn timer, resets each time it becomes our turn.
  const [remaining, setRemaining] = useState(TURN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!myTurn) { setRemaining(TURN_SECONDS); return; }
    setRemaining(TURN_SECONDS);
    timerRef.current = setInterval(() => {
      setRemaining((s) => {
        const next = Math.max(0, s - 1);
        if (next > 0 && next <= 5) playSound("turnTick");
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [myTurn, view?.phase]);

  const goToLobby = () => {
    socket.emit("room:leave", {}, () => { void navigate("/lobby"); });
  };

  // ── Derived seat geometry (must run before any early return for hook order) ──
  const me = view?.forPlayer ?? "";
  const meIdx = view ? view.players.indexOf(me) : 0;
  const seatLayout = useMemo(() => {
    if (!view) return [] as { playerId: string; idx: number; pos: "left" | "top" | "right" }[];
    const order: ("left" | "top" | "right")[] = ["left", "top", "right"];
    return order.map((pos, k) => {
      const idx = (meIdx + k + 1) % view.players.length;
      return { playerId: view.players[idx], idx, pos };
    });
  }, [view, meIdx]);

  if (room?.phase === "lobby") return <WaitingRoom room={room} />;
  if (!view) return <CardLoadingScreen />;

  const myTeam = meIdx % 2;
  const oppTeam = myTeam === 0 ? 1 : 0;
  const isGameOver = view.phase === "gameOver";
  const hakemId = view.hakemIndex !== null ? view.players[view.hakemIndex] : null;
  const iAmHakem = view.hakemIndex === meIdx;

  const teamColorFor = (idx: number) => (idx % 2 === 0 ? "primary" : "tertiary") as "primary" | "tertiary";

  // ── Phase-specific local-hand interactions ──
  const legalCardKeys = new Set(
    view.phase === "playing" && myTurn
      ? shelemLegalPlays(view.hand, view.currentTrick).map(cardKey)
      : [],
  );
  const settingTrump = view.phase === "playing" && iAmHakem && view.trumpSuit === null && view.currentTrick.length === 0;

  const onHandCard = (c: Card) => {
    if (view.phase === "playing" && myTurn && legalCardKeys.has(cardKey(c))) {
      sendMove({ type: "playCard", card: c });
      return;
    }
    if (view.phase === "zaminExchange" && iAmHakem) {
      setDiscardSel((prev) => {
        const has = prev.some((d) => cardKey(d) === cardKey(c));
        if (has) return prev.filter((d) => cardKey(d) !== cardKey(c));
        if (prev.length >= 4) return prev;
        return [...prev, c];
      });
    }
  };

  const submitBid = () => sendMove({ type: "bid", amount: bidValue });
  const ceiling = shelemMaxBid(view.options.aceValue);

  const trumpBadge = view.trumpSuit ? (
    <span className={styles.trumpBadge} data-suit={view.trumpSuit}>
      {SUIT_SYMBOL[view.trumpSuit]}
    </span>
  ) : null;

  return (
    <div className={styles.root}>
      <div className={styles.table}>
        <div className={styles.felt} aria-hidden="true">
          <div className={styles.feltEmblem}>
            <span className={styles.feltSuit} data-suit="spades">♠</span>
            <span className={styles.feltSuit} data-suit="hearts">♥</span>
            <span className={styles.feltSuit} data-suit="diamonds">♦</span>
            <span className={styles.feltSuit} data-suit="clubs">♣</span>
          </div>
        </div>

        {/* ── Score bar ── */}
        <div className={styles.scoreBar}>
          {!isGameOver && (
            <button
              className={styles.exitBtn}
              onClick={() => setConfirmLeave(true)}
              aria-label={t("room.leave.leaveGame")}
              title={t("room.leave.leaveGame")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
          <div className={[styles.scoreItem, styles.teamUs].join(" ")}>
            <span className={styles.scoreName}>{t("shelem.usTeam")}</span>
            <span className={styles.scorePts}>{view.scores[myTeam]}</span>
          </div>
          <div className={styles.scoreMid}>
            <span className={styles.scoreRound}>{t("shelem.round", { n: view.roundNumber + 1 })}</span>
            <span className={styles.scoreContract}>
              {view.contractBid !== null
                ? (view.contractIsShelem ? t("shelem.slam") : t("shelem.contract", { n: view.contractBid }))
                : t("shelem.bidding")}
              {trumpBadge}
            </span>
            <span className={styles.scoreTargetLabel}>{t("shelem.toTarget", { n: view.targetScore })}</span>
          </div>
          <div className={[styles.scoreItem, styles.teamThem].join(" ")}>
            <span className={styles.scoreName}>{t("shelem.themTeam")}</span>
            <span className={styles.scorePts}>{view.scores[oppTeam]}</span>
          </div>
        </div>

        {/* ── Opponent seats ── */}
        {seatLayout.map(({ playerId, idx, pos }) => (
          <OpponentSeat
            key={playerId}
            playerId={playerId}
            nickname={nameOf(room, playerId)}
            discriminator={discOf(room, playerId)}
            isHakem={view.hakemIndex === idx}
            isConnected={connectedOf(room, playerId)}
            isTurn={!isGameOver && view.currentTurn === playerId}
            avatarUrl={avatarOf(room, playerId)}
            handSize={view.handSizes[idx]}
            trickCount={view.tricksWonTeam[idx % 2]}
            teamColor={teamColorFor(idx)}
            position={pos}
            sticker={stickers[playerId] ?? null}
            className={styles[`seat_${pos}`]}
          />
        ))}

        {/* ── Center: trick area / bidding status ── */}
        <div className={styles.center}>
          {view.phase === "bidding" ? (
            <BiddingStatus view={view} room={room} t={t} />
          ) : (
            <div className={styles.trick} aria-label={t("shelem.trick")}>
              {view.currentTrick.length === 0 ? (
                <span className={styles.trickEmpty}>
                  {view.phase === "zaminExchange"
                    ? t("shelem.exchangeInProgress")
                    : settingTrump
                      ? t("shelem.leadSetsTrump")
                      : "·"}
                </span>
              ) : (
                view.currentTrick.map((tp) => (
                  <div key={cardKey(tp.card)} className={styles.trickCard}>
                    <span className={styles.trickName}>{tp.playerId === me ? t("shelem.you") : nameOf(room, tp.playerId)}</span>
                    <span className={styles.trickDrop}>
                      <PlayingCard card={tp.card} faceUp compact />
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          <div className={styles.turnPill}>
            {isGameOver
              ? t("shelem.gameOver.title")
              : myTurn
                ? (view.phase === "bidding" ? t("shelem.yourBid") : view.phase === "zaminExchange" ? t("shelem.yourExchange") : t("shelem.yourTurn"))
                : t("shelem.waitingFor", { name: nameOf(room, view.currentTurn ?? "") })}
          </div>
        </div>

        {/* ── Local hand tray ── */}
        <div className={[styles.localHand, myTurn ? styles.myTurn : ""].join(" ")}>
          <div className={styles.playerRow}>
            <div className={styles.playerInfo}>
              <div className={styles.avatarWrap}>
                {stickers[me] && <StickerBubble key={stickers[me].nonce} stickerId={stickers[me].id} placement="above" />}
                <PlayerAvatar
                  nickname={t("shelem.you")}
                  avatarUrl={avatarOf(room, me)}
                  isHakem={iAmHakem}
                  teamColor={teamColorFor(meIdx)}
                  compact
                />
              </div>
              <TrickPile count={view.tricksWonTeam[myTeam]} teamColor={teamColorFor(meIdx)} />
            </div>
            <div className={styles.playerRowRight}>
              {myTeam !== undefined && (
                <span className={styles.madeChip}>{t("shelem.points", { n: view.teamPoints[myTeam] })}</span>
              )}
              {myTurn && (
                <div className={styles.timerArea}>
                  <CountdownRing totalSeconds={TURN_SECONDS} remainingSeconds={remaining} size={48} />
                </div>
              )}
            </div>
          </div>

          {moveError && (
            <div className={styles.errorToast} role="alert" onClick={clearMoveError}>{moveError}</div>
          )}

          {/* Zamin exchange controls (Hakem only) */}
          {view.phase === "zaminExchange" && iAmHakem && (
            <div className={styles.exchangeBar}>
              <span className={styles.exchangeHint}>{t("shelem.buryHint", { n: discardSel.length })}</span>
              <button
                className={styles.primaryBtn}
                disabled={discardSel.length !== 4}
                onClick={() => { sendMove({ type: "discard", cards: discardSel }); setDiscardSel([]); }}
              >
                {t("shelem.buryConfirm")}
              </button>
            </div>
          )}

          {/* Bidding controls (active bidder only) */}
          {view.phase === "bidding" && myTurn && (
            <div className={styles.bidBar}>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setBidValue((v) => Math.max(biddingFloor, v - SHELEM_BID_STEP))}
                  disabled={view.isShelemBid || bidValue <= biddingFloor}
                  aria-label="−"
                >−</button>
                <span className={styles.stepperValue} aria-live="polite">{bidValue}</span>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setBidValue((v) => Math.min(ceiling, v + SHELEM_BID_STEP))}
                  disabled={view.isShelemBid || bidValue >= ceiling}
                  aria-label="+"
                >+</button>
              </div>
              <button className={styles.bidBtn} disabled={view.isShelemBid || biddingFloor > ceiling} onClick={submitBid}>
                {t("shelem.bid")}
              </button>
              <button className={styles.shelemBtn} disabled={view.isShelemBid} onClick={() => sendMove({ type: "bidShelem" })}>
                {t("shelem.callShelem")}
              </button>
              <button className={styles.passBtn} onClick={() => sendMove({ type: "pass" })}>
                {t("shelem.pass")}
              </button>
            </div>
          )}

          <div className={styles.hand} role="list" aria-label={t("shelem.yourHand")}>
            {view.hand.map((c) => {
              const selected = discardSel.some((d) => cardKey(d) === cardKey(c));
              const playable = view.phase === "playing" && myTurn && legalCardKeys.has(cardKey(c));
              const selectable = view.phase === "zaminExchange" && iAmHakem;
              return (
                <div key={cardKey(c)} className={styles.handCard} role="listitem">
                  <PlayingCard
                    card={c}
                    faceUp
                    highlighted={playable || (selectable && !selected)}
                    disabled={!playable && !selectable}
                    onClick={playable || selectable ? () => onHandCard(c) : undefined}
                    className={selected ? styles.handSelected : undefined}
                    aria-label={`${c.rank} of ${c.suit}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>{/* end table */}

      {/* Trump-set flash */}
      {trumpFlash && (
        <div className={styles.trumpFlash} data-suit={trumpFlash}>
          {SUIT_SYMBOL[trumpFlash]} {t("shelem.trumpIs", { suit: t(`shelem.suits.${trumpFlash}`) })}
        </div>
      )}

      {/* Round-over popup */}
      {roundFlash && !isGameOver && (
        <div className={styles.overlay} role="alertdialog" aria-modal="true">
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>{t("shelem.roundOver.title")}</h2>
            <p className={styles.sheetSub}>
              {roundFlash.contractMade ? t("shelem.roundOver.made") : t("shelem.roundOver.failed")}
            </p>
            <div className={styles.finalScores}>
              {[myTeam, oppTeam].map((teamSlot) => {
                const isUs = teamSlot === myTeam;
                const isHakemTeam = teamSlot === roundFlash.hakemTeam;
                return (
                  <div key={teamSlot} className={styles.roundRow}>
                    <span className={styles.roundRowName}>
                      {isUs ? t("shelem.usTeam") : t("shelem.themTeam")}
                      {isHakemTeam && <span className={styles.hakemTag}>{t("shelem.hakemShort")}</span>}
                    </span>
                    <span className={styles.roundMade}>{t("shelem.points", { n: roundFlash.made[teamSlot] })}</span>
                    <span className={[styles.roundDelta, roundFlash.delta[teamSlot] < 0 ? styles.deltaNeg : ""].join(" ")}>
                      {roundFlash.delta[teamSlot] >= 0 ? "+" : ""}{roundFlash.delta[teamSlot]}
                    </span>
                    <span className={styles.finalPts}>{roundFlash.scores[teamSlot]} / {view.targetScore}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.sheetActions}>
              <button className={styles.primaryBtn} onClick={() => setRoundFlash(null)}>
                {t("shelem.roundOver.continue")}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isGameOver && <StickerWheel />}

      {/* Game over */}
      {isGameOver && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>
              {view.scores[myTeam] > view.scores[oppTeam] ? t("shelem.gameOver.youWin") : t("shelem.gameOver.youLose")}
            </h2>
            <div className={styles.finalScores}>
              {[myTeam, oppTeam].map((teamSlot) => (
                <div key={teamSlot} className={[styles.finalRow, view.scores[teamSlot] > view.scores[teamSlot === myTeam ? oppTeam : myTeam] ? styles.finalWinner : ""].join(" ")}>
                  <span>{teamSlot === myTeam ? t("shelem.usTeam") : t("shelem.themTeam")}</span>
                  <span className={styles.finalPts}>{view.scores[teamSlot]}</span>
                </div>
              ))}
            </div>
            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={goToLobby}>{t("shelem.gameOver.leave")}</button>
              <button className={styles.primaryBtn} onClick={() => socket.emit("room:rematch", {}, () => {})}>
                {t("shelem.gameOver.rematch")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave confirm */}
      {confirmLeave && (
        <div className={styles.overlay} role="alertdialog" aria-modal="true">
          <div className={styles.sheet}>
            <p className={styles.sheetTitle}>{t("room.leave.confirm")}</p>
            <p className={styles.sheetSub}>{t("room.leave.gameWillPause")}</p>
            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={() => setConfirmLeave(false)}>{t("room.leave.cancel")}</button>
              <button className={styles.dangerBtn} onClick={goToLobby}>{t("room.leave.leaveGame")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Aborted */}
      {ended && (
        <div className={styles.overlay} role="alertdialog" aria-modal="true">
          <div className={styles.sheet}>
            <p className={styles.sheetTitle}>{t("hokm.aborted.title")}</p>
            <p className={styles.sheetSub}>
              {ended.reason === "hostEnded"
                ? t("hokm.aborted.descHost")
                : ended.by ? t("hokm.aborted.descBy", { name: ended.by }) : t("hokm.aborted.desc")}
            </p>
            <div className={styles.sheetActions}>
              <button className={styles.primaryBtn} onClick={goToLobby}>{t("hokm.aborted.toLobby")}</button>
            </div>
          </div>
        </div>
      )}

      <span className={styles.hakemAnchor} hidden>{hakemId ?? ""}</span>
    </div>
  );
}

// ── Auction status board (centre, during bidding) ──────────────────────────────

function BiddingStatus({
  view,
  room,
  t,
}: {
  view: ShelemView;
  room: Room;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className={styles.auction}>
      <div className={styles.auctionHigh}>
        {view.isShelemBid ? (
          <span className={styles.auctionSlam}>{t("shelem.slamCalled", { name: nameOf(room, view.players[view.highBidder ?? 0]) })}</span>
        ) : view.highBid !== null ? (
          <span>{t("shelem.highBid", { n: view.highBid, name: nameOf(room, view.players[view.highBidder ?? 0]) })}</span>
        ) : (
          <span className={styles.auctionNone}>{t("shelem.noBidYet")}</span>
        )}
      </div>
      <ul className={styles.auctionList}>
        {view.players.map((p, i) => (
          <li key={p} className={[styles.auctionSeat, view.currentBidder === i ? styles.auctionActive : "", view.passed[i] ? styles.auctionPassed : ""].join(" ")}>
            <span className={styles.auctionSeatName}>{p === view.forPlayer ? t("shelem.you") : nameOf(room, p)}</span>
            <span className={styles.auctionSeatBid}>
              {view.passed[i]
                ? t("shelem.passed")
                : view.highBidder === i
                  ? (view.isShelemBid ? t("shelem.slam") : String(view.highBid))
                  : view.currentBidder === i ? "…" : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
