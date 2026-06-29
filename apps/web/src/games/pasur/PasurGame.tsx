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
import { StickerWheel } from "../hokm/StickerWheel";
import { WaitingRoom } from "../hokm/WaitingRoom";
import { usePasurSocket } from "./usePasurSocket";
import styles from "./PasurGame.module.css";

function nameOf(room: ReturnType<typeof usePasurSocket>["room"], playerId: string): string {
  return room?.seats.find((s) => s.playerId === playerId)?.nickname ?? playerId.slice(0, 6);
}
function avatarOf(room: ReturnType<typeof usePasurSocket>["room"], playerId: string): string | null {
  return room?.seats.find((s) => s.playerId === playerId)?.avatar ?? null;
}

/** A face-down pile chip showing a count (captured pile / deck). */
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
  const [roundFlash, setRoundFlash] = useState<{ round: number; points: Record<string, number> } | null>(null);
  const [ended, setEnded] = useState<{ reason: "playerLeft" | "hostEnded"; by: string | null } | null>(null);
  // Card-flight animation state.
  // `playIn` = the pool card that just flew in from a seat (a lay-down play).
  // `flying` = a captured set flying off the table to a player's pile.
  const [playIn, setPlayIn] = useState<{ key: string; from: "top" | "bottom" } | null>(null);
  const [flying, setFlying] = useState<{ id: number; cards: Card[]; from: "top" | "bottom" } | null>(null);
  const flyIdRef = useRef(0);

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
        } else {
          // A lay-down: the card flies in from its owner's seat into the pool.
          setPlayIn({ key: pasurCardKey(d.card), from });
          setTimeout(() => setPlayIn(null), 400);
        }
      } else if (e.type === "sur") {
        const who = (e.data as { playerId: string }).playerId;
        setSurFlash(who);
        setTimeout(() => setSurFlash(null), 1600);
      } else if (e.type === "roundOver") {
        const d = e.data as { roundNumber: number; roundPoints: Record<string, number> };
        playSound("trickWin");
        setRoundFlash({ round: d.roundNumber, points: d.roundPoints });
        setTimeout(() => setRoundFlash(null), 3200);
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

  /** Cumulative-score chip: "score / target". */
  const ScoreChip = ({ idx }: { idx: number }) => (
    <span className={styles.scoreChip}>
      <span className={styles.scoreNow}>{view.scores[idx]}</span>
      <span className={styles.scoreTarget}>/ {view.targetScore}</span>
    </span>
  );

  return (
    <div className={styles.root}>
      {/* ── Opponent ── */}
      <div className={[styles.seat, view.currentTurn === opponent ? styles.activeSeat : ""].join(" ")}>
        <PlayerAvatar
          nickname={nameOf(room, opponent)}
          avatarUrl={avatarOf(room, opponent)}
          compact
        />
        <div className={styles.seatStats}>
          <ScoreChip idx={oppIdx} />
          <PileChip label={t("pasur.captured")} count={view.capturedCounts[oppIdx]} />
          {view.surs[oppIdx] > 0 && (
            <span className={styles.surBadge}>{t("pasur.sur")} ×{view.surs[oppIdx]}</span>
          )}
        </div>
        {surFlash === opponent && <div className={styles.surFlash}>{t("pasur.sur")}!</div>}
      </div>

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
                  <PlayingCard
                    card={c}
                    faceUp
                    compact
                    animateFrom={playIn?.key === k ? playIn.from : undefined}
                  />
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
        {!isGameOver && (
          <span className={styles.roundHint}>
            {t("pasur.round", { n: view.roundNumber + 1 })} · {t("pasur.toTarget", { n: view.targetScore })}
          </span>
        )}
      </div>

      {/* ── Captured cards flying to a pile ── */}
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

      {/* ── Round-over banner ── */}
      {roundFlash && (
        <div className={styles.roundBanner} role="status">
          <span className={styles.roundBannerTitle}>{t("pasur.round", { n: roundFlash.round + 1 })}</span>
          <span className={styles.roundBannerScores}>
            {t("pasur.you")} +{roundFlash.points[me] ?? 0} · {nameOf(room, opponent)} +{roundFlash.points[opponent] ?? 0}
          </span>
        </div>
      )}

      {/* ── Combination picker ── */}
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

      {/* ── Move error ── */}
      {moveError && (
        <div className={styles.errorToast} role="alert" onClick={clearMoveError}>
          {moveError}
        </div>
      )}

      {/* ── Local player ── */}
      <div className={[styles.localBar, myTurn ? styles.localActive : ""].join(" ")}>
        <div className={styles.localInfo}>
          <PlayerAvatar nickname={t("pasur.you")} avatarUrl={avatarOf(room, me)} compact />
          <div className={styles.seatStats}>
            <ScoreChip idx={meIdx} />
            <PileChip label={t("pasur.captured")} count={view.capturedCounts[meIdx]} />
            {view.surs[meIdx] > 0 && (
              <span className={styles.surBadge}>{t("pasur.sur")} ×{view.surs[meIdx]}</span>
            )}
          </div>
          <button className={styles.leaveBtn} onClick={() => setConfirmLeave(true)} aria-label={t("room.leave.leaveGame")}>
            ✕
          </button>
        </div>

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
        {surFlash === me && <div className={styles.surFlash}>{t("pasur.sur")}!</div>}
      </div>

      {/* Sticker chat — reused from Hokm. */}
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
