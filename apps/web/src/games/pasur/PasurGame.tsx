import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Card, GameEvent, PasurMove } from "@varagh/shared";
import { captureOptionsFor, pasurCardKey } from "@varagh/shared";
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
import { usePasurSocket } from "./usePasurSocket";
import styles from "./PasurGame.module.css";

const TURN_SECONDS = 30;

type Room = ReturnType<typeof usePasurSocket>["room"];
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

/** A face-down pile chip showing a count (the deck). */
function PileChip({ label, count }: { label: string; count: number }) {
  return (
    <div className={styles.pileChip}>
      <span className={styles.pileBack} aria-hidden="true" />
      <span className={styles.pileMeta}>
        <span className={styles.pileCount}>{count}</span>
        <span className={styles.pileLabel}>{label}</span>
      </span>
    </div>
  );
}

export function PasurGame() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { view, room, events, sendMove, moveError, clearMoveError } = usePasurSocket();

  const [selected, setSelected] = useState<{ card: Card; options: Card[][] } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [surFlash, setSurFlash] = useState<string | null>(null);
  const [roundFlash, setRoundFlash] = useState<{ round: number; points: Record<string, number>; scores: Record<string, number> } | null>(null);
  const [ended, setEnded] = useState<{ reason: "playerLeft" | "hostEnded"; by: string | null } | null>(null);
  // Card-flight animation state. `flying` = a captured set flying off the table
  // to a player's pile. (Newly-laid pool cards animate in on mount via CSS.)
  const [flying, setFlying] = useState<{ id: number; cards: Card[]; from: "top" | "bottom" } | null>(null);
  const flyIdRef = useRef(0);
  // Stickers currently floating over each seat: playerId → { id, nonce }.
  const [stickers, setStickers] = useState<Record<string, { id: string; nonce: number }>>({});
  const stickerNonceRef = useRef(0);
  const stickerTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Join (or rejoin) on mount — RoomRouter owns the active-room registration,
  // but we re-join here after our listeners are wired so the server re-pushes
  // our current view (handles the subscribe-after-join race and reconnects).
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

  // Incoming stickers from anyone in the room (including our own echo).
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

  // Sound + Sur + card-flight feedback from the event stream.
  const lastEventRef = useRef<GameEvent[]>([]);
  useEffect(() => {
    if (events === lastEventRef.current) return;
    lastEventRef.current = events;
    const meId = view?.forPlayer;
    for (const e of events) {
      if (e.type === "cardPlayed") {
        const d = e.data as { playerId: string; card: Card; captured?: Card[] };
        const captured = d.captured ?? [];
        const from: "top" | "bottom" = d.playerId === meId ? "bottom" : "top";
        playSound(captured.length > 0 ? "trickWin" : "playCard");
        if (captured.length > 0) {
          // The played card plus its captures fly off to the capturer's pile.
          const id = ++flyIdRef.current;
          setFlying({ id, cards: [d.card, ...captured], from });
          setTimeout(() => setFlying((f) => (f && f.id === id ? null : f)), 680);
        }
        // A lay-down needs no overlay — the new pool card animates in on mount.
      } else if (e.type === "sur") {
        const who = (e.data as { playerId: string }).playerId;
        setSurFlash(who);
        setTimeout(() => setSurFlash(null), 1600);
      } else if (e.type === "roundOver") {
        const d = e.data as { roundNumber: number; roundPoints: Record<string, number>; scores: Record<string, number> };
        playSound("trickWin");
        // A modal popup the player dismisses to continue — see render below.
        setRoundFlash({ round: d.roundNumber, points: d.roundPoints, scores: d.scores });
      } else if (e.type === "gameOver") {
        playSound("gameWin");
      }
    }
  }, [events, view]);

  // Clear any open combination picker when it stops being our turn.
  const myTurn = !!view && view.phase === "playing" && view.currentTurn === view.forPlayer;
  useEffect(() => {
    if (!myTurn) setSelected(null);
  }, [myTurn]);

  // Local turn timer: a 30s client-side countdown that resets each time it
  // becomes our turn (mirrors Hokm; the opponent seat shows its own ring).
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
  }, [myTurn]);

  if (room?.phase === "lobby") return <WaitingRoom room={room} />;
  if (!view) return <CardLoadingScreen />;

  const me = view.forPlayer;
  const opponent = view.players.find((p) => p !== me) ?? me;
  const meIdx = view.players.indexOf(me);
  const oppIdx = view.players.indexOf(opponent);

  const isGameOver = view.phase === "gameOver";

  const handleCardTap = (card: Card) => {
    if (!myTurn) return;
    const options = captureOptionsFor(card, view.pool, view.options);
    if (options.length <= 1) {
      sendMove({ type: "play", card, capture: options[0] ?? [] });
      setSelected(null);
      return;
    }
    // Multiple distinct sum-to-11 combinations — let the player choose.
    setSelected({ card, options });
  };

  const confirmCombination = (capture: Card[]) => {
    if (!selected) return;
    sendMove({ type: "play", card: selected.card, capture });
    setSelected(null);
  };

  const goToLobby = () => {
    socket.emit("room:leave", {}, () => { void navigate("/lobby"); });
  };

  // Pool cards highlighted while the player is choosing a combination.
  const previewKeys = new Set(selected ? selected.options.flat().map(pasurCardKey) : []);

  // Does a hand card capture anything? (Used to highlight capturing cards.)
  const cardCaptures = (card: Card): boolean =>
    captureOptionsFor(card, view.pool, view.options).some((o) => o.length > 0);

  const winner = isGameOver
    ? (() => {
        const max = Math.max(...view.scores);
        const idxs = view.scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
        return idxs.length === 1 ? view.players[idxs[0]] : null; // null = draw
      })()
    : undefined;

  return (
    <div className={styles.root}>
      <div className={styles.table}>
        {/* Decorative felt + centre emblem (behind all seats) */}
        <div className={styles.felt} aria-hidden="true">
          <div className={styles.feltEmblem}>
            <span className={styles.feltSuit} data-suit="spades">♠</span>
            <span className={styles.feltSuit} data-suit="hearts">♥</span>
            <span className={styles.feltSuit} data-suit="diamonds">♦</span>
            <span className={styles.feltSuit} data-suit="clubs">♣</span>
          </div>
        </div>

        {/* ── Score bar (top) ── */}
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
          <div className={styles.scoreItem}>
            <span className={styles.scoreName}>{t("pasur.you")}</span>
            <span className={styles.scorePts}>{view.scores[meIdx]}</span>
            {view.surs[meIdx] > 0 && <span className={styles.scoreSur}>{t("pasur.sur")}×{view.surs[meIdx]}</span>}
          </div>
          <div className={styles.scoreMid}>
            <span className={styles.scoreRound}>{t("pasur.round", { n: view.roundNumber + 1 })}</span>
            <span className={styles.scoreTargetLabel}>{t("pasur.toTarget", { n: view.targetScore })}</span>
          </div>
          <div className={styles.scoreItem}>
            <span className={styles.scoreName}>{nameOf(room, opponent)}</span>
            <span className={styles.scorePts}>{view.scores[oppIdx]}</span>
            {view.surs[oppIdx] > 0 && <span className={styles.scoreSur}>{t("pasur.sur")}×{view.surs[oppIdx]}</span>}
          </div>
        </div>

        {/* ── Opponent seat (top) — reused from Hokm: border + active-turn ring ── */}
        <OpponentSeat
          playerId={opponent}
          nickname={nameOf(room, opponent)}
          discriminator={discOf(room, opponent)}
          isHakem={false}
          isConnected={connectedOf(room, opponent)}
          isTurn={!isGameOver && view.currentTurn === opponent}
          avatarUrl={avatarOf(room, opponent)}
          handSize={view.handSizes[oppIdx]}
          trickCount={view.capturedCounts[oppIdx]}
          teamColor="none"
          position="top"
          sticker={stickers[opponent] ?? null}
          className={styles.seat_top}
        />

        {/* ── Center: deck + pool ── */}
        <div className={styles.center}>
          <PileChip label={t("pasur.deck")} count={view.deckCount} />

          <div className={styles.pool} aria-label={t("pasur.pool")}>
            {view.pool.length === 0 ? (
              <span className={styles.poolEmpty}>{t("pasur.poolEmpty")}</span>
            ) : (
              view.pool.map((c) => {
                const k = pasurCardKey(c);
                return (
                  <div
                    key={k}
                    className={[styles.poolCard, previewKeys.has(k) ? styles.poolPreview : ""].join(" ")}
                  >
                    {/* Inner span animates on mount: every newly-laid card drops in. */}
                    <span className={styles.poolDrop}>
                      <PlayingCard card={c} faceUp compact />
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.turnPill}>
            {isGameOver
              ? t("pasur.gameOver.title")
              : myTurn
                ? t("pasur.yourTurn")
                : t("pasur.opponentTurn", { name: nameOf(room, view.currentTurn ?? opponent) })}
          </div>

          {/* Captured cards flying to a pile */}
          {flying && (
            <div
              className={[styles.flyLayer, flying.from === "top" ? styles.flyUp : styles.flyDown].join(" ")}
              aria-hidden="true"
            >
              {flying.cards.map((c, i) => (
                <span key={`${pasurCardKey(c)}-${i}`} className={styles.flyCard} style={{ animationDelay: `${i * 45}ms` }}>
                  <PlayingCard card={c} faceUp compact />
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Local hand tray (bottom) ── */}
        <div className={[styles.localHand, myTurn ? styles.myTurn : ""].join(" ")}>
          <div className={styles.playerRow}>
            <div className={styles.playerInfo}>
              <div className={styles.avatarWrap}>
                {stickers[me] && (
                  <StickerBubble key={stickers[me].nonce} stickerId={stickers[me].id} placement="above" />
                )}
                <PlayerAvatar nickname={t("pasur.you")} avatarUrl={avatarOf(room, me)} compact />
              </div>
              <TrickPile count={view.capturedCounts[meIdx]} />
            </div>
            <div className={styles.playerRowRight}>
              {myTurn && (
                <div className={styles.timerArea}>
                  <CountdownRing totalSeconds={TURN_SECONDS} remainingSeconds={remaining} size={48} />
                </div>
              )}
            </div>
          </div>

          {moveError && (
            <div className={styles.errorToast} role="alert" onClick={clearMoveError}>
              {moveError}
            </div>
          )}

          <div className={styles.hand} role="list" aria-label={t("pasur.yourHand")}>
            {view.hand.map((c) => {
              const isSel = selected && pasurCardKey(selected.card) === pasurCardKey(c);
              return (
                <div key={pasurCardKey(c)} className={styles.handCard} role="listitem">
                  <PlayingCard
                    card={c}
                    faceUp
                    highlighted={myTurn && cardCaptures(c)}
                    disabled={!myTurn}
                    onClick={myTurn ? () => handleCardTap(c) : undefined}
                    className={isSel ? styles.handSelected : undefined}
                    aria-label={`${c.rank} of ${c.suit}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>{/* end table */}

      {/* Sur flash (centred) */}
      {surFlash && <div className={styles.surFlash}>{t("pasur.sur")}!</div>}

      {/* Round-over popup — shown after every round; dismiss to continue. */}
      {roundFlash && !isGameOver && (
        <div className={styles.overlay} role="alertdialog" aria-modal="true">
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>{t("pasur.roundOver.title", { n: roundFlash.round + 1 })}</h2>
            <p className={styles.sheetSub}>{t("pasur.roundOver.subtitle")}</p>
            <div className={styles.finalScores}>
              {view.players.map((p) => (
                <div key={p} className={styles.roundRow}>
                  <span className={styles.roundRowName}>{p === me ? t("pasur.you") : nameOf(room, p)}</span>
                  <span className={styles.roundDelta}>+{roundFlash.points[p] ?? 0}</span>
                  <span className={styles.finalPts}>{roundFlash.scores[p] ?? 0} / {view.targetScore}</span>
                </div>
              ))}
            </div>
            <div className={styles.sheetActions}>
              <button className={styles.primaryBtn} onClick={() => setRoundFlash(null)}>
                {t("pasur.roundOver.continue")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combination picker */}
      {selected && (
        <div className={styles.picker} role="dialog" aria-label={t("pasur.chooseCombination")}>
          <div className={styles.pickerHeader}>
            <span>{t("pasur.chooseCombination")}</span>
            <button className={styles.pickerCancel} onClick={() => setSelected(null)}>
              {t("pasur.cancel")}
            </button>
          </div>
          <div className={styles.pickerOptions}>
            {selected.options.map((opt, i) => (
              <button
                key={i}
                className={styles.pickerOption}
                onClick={() => confirmCombination(opt)}
              >
                {opt.map((c) => (
                  <span key={pasurCardKey(c)} className={styles.pickerMini}>
                    <PlayingCard card={c} faceUp compact />
                  </span>
                ))}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticker chat — sibling of the table so it floats without disturbing play. */}
      {!isGameOver && <StickerWheel />}

      {/* ── Game over ── */}
      {isGameOver && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.sheet}>
            <h2 className={styles.sheetTitle}>
              {winner === undefined || winner === null
                ? t("pasur.gameOver.draw")
                : winner === me
                  ? t("pasur.gameOver.youWin")
                  : t("pasur.gameOver.youLose")}
            </h2>
            <div className={styles.finalScores}>
              {view.players.map((p, i) => (
                <div key={p} className={[styles.finalRow, p === winner ? styles.finalWinner : ""].join(" ")}>
                  <span>{p === me ? t("pasur.you") : nameOf(room, p)}</span>
                  <span className={styles.finalPts}>{view.scores[i]}</span>
                </div>
              ))}
            </div>
            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={goToLobby}>
                {t("pasur.gameOver.leave")}
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => socket.emit("room:rematch", {}, () => {})}
              >
                {t("pasur.gameOver.rematch")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave confirm ── */}
      {confirmLeave && (
        <div className={styles.overlay} role="alertdialog" aria-modal="true">
          <div className={styles.sheet}>
            <p className={styles.sheetTitle}>{t("room.leave.confirm")}</p>
            <p className={styles.sheetSub}>{t("room.leave.gameWillPause")}</p>
            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={() => setConfirmLeave(false)}>
                {t("room.leave.cancel")}
              </button>
              <button className={styles.dangerBtn} onClick={goToLobby}>
                {t("room.leave.leaveGame")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Aborted ── */}
      {ended && (
        <div className={styles.overlay} role="alertdialog" aria-modal="true">
          <div className={styles.sheet}>
            <p className={styles.sheetTitle}>{t("hokm.aborted.title")}</p>
            <p className={styles.sheetSub}>
              {ended.reason === "hostEnded"
                ? t("hokm.aborted.descHost")
                : ended.by
                  ? t("hokm.aborted.descBy", { name: ended.by })
                  : t("hokm.aborted.desc")}
            </p>
            <div className={styles.sheetActions}>
              <button className={styles.primaryBtn} onClick={goToLobby}>
                {t("hokm.aborted.toLobby")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
