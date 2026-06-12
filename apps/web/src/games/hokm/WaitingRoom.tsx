import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { RoomView, FriendEntry } from "@varagh/shared";
import { socket } from "../../app/socket";
import { getStoredUser } from "../../auth/auth-store";
import styles from "./WaitingRoom.module.css";

interface WaitingRoomProps {
  room: RoomView;
}

function minPlayersForVariant(variantId: string): number {
  const match = /(\d+)p$/.exec(variantId);
  return match ? parseInt(match[1], 10) : 2;
}

function shortVariantKey(variantId: string): "4p" | "3p" | "2p" {
  const match = /(\d+)p$/.exec(variantId);
  const n = match?.[1];
  if (n === "4" || n === "3" || n === "2") return `${n}p` as "4p" | "3p" | "2p";
  return "4p";
}

export function WaitingRoom({ room }: WaitingRoomProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = getStoredUser();

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [onlineFriends, setOnlineFriends] = useState<FriendEntry[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    socket.emit("friend:list", {}, (res) => {
      const seated = new Set(room.seats.map((s) => s.playerId));
      setOnlineFriends(
        res.friends.filter((f) => f.status === "accepted" && f.online && !seated.has(f.userId))
      );
    });
  }, [room.seats]);

  const handleInviteFriend = (userId: string) => {
    socket.emit("room:inviteFriend", { userId }, () => {
      setInvitedIds((prev) => new Set([...prev, userId]));
    });
  };

  const [settingReady, setSettingReady] = useState(false);

  const isHost = room.seats.some(
    (s) => s.playerId === user?.id && s.isHost,
  );
  const minPlayers = minPlayersForVariant(room.variantId);
  const enoughPlayers = room.seats.length >= minPlayers;
  const myReady = room.seats.find((s) => s.playerId === user?.id)?.ready ?? false;
  // Host always counts as ready (server-side too), so this covers everyone.
  const allReady = room.seats.every((s) => s.ready);
  const canStart = isHost && enoughPlayers && allReady;

  const toggleReady = () => {
    setSettingReady(true);
    socket.emit("room:setReady", { ready: !myReady }, () => setSettingReady(false));
  };

  const handleStart = () => {
    setStarting(true);
    setStartError(null);
    socket.emit("game:start", {}, (res) => {
      setStarting(false);
      if (!res.ok) {
        setStartError(res.error);
      }
    });
  };

  const handleLeaveConfirmed = () => {
    socket.emit("room:leave", {}, () => {
      void navigate("/lobby");
    });
  };

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${room.code}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.logo} aria-label="Varagh">ورق</span>
          <span className={styles.gameLabel}>Hokm · حکم · {t(`lobby.variants.${shortVariantKey(room.variantId)}`)}</span>
        </div>

        <h1 className={styles.title}>{t("room.waiting.title")}</h1>

        {/* Join code */}
        <div className={styles.codeSection}>
          <span className={styles.codeLabel}>{t("room.waiting.codeLabel")}</span>
          <div className={styles.codeRow}>
            <span className={styles.code}>{room.code}</span>
            <button
              className={styles.copyBtn}
              onClick={handleCopyCode}
              aria-label={t("room.waiting.copyCode")}
            >
              {copied ? t("room.waiting.copied") : t("room.waiting.copyCode")}
            </button>
          </div>
          <button
            className={styles.copyLinkBtn}
            onClick={handleCopyLink}
            aria-label={t("room.waiting.copyLink")}
          >
            <LinkIcon />
            {copiedLink ? t("room.waiting.copied") : t("room.waiting.copyLink")}
          </button>
        </div>

        {/* Invite online friends */}
        {onlineFriends.length > 0 && (
          <div className={styles.friendsSection}>
            <span className={styles.friendsLabel}>{t("room.waiting.inviteFriends")}</span>
            <ul className={styles.friendsList}>
              {onlineFriends.map((f) => (
                <li key={f.userId} className={styles.friendItem}>
                  <span className={styles.friendOnlineDot} aria-hidden="true" />
                  <span className={styles.friendName}>{f.nickname}<span className={styles.friendDisc}>#{f.discriminator}</span></span>
                  <button
                    className={styles.inviteBtn}
                    onClick={() => handleInviteFriend(f.userId)}
                    disabled={invitedIds.has(f.userId)}
                  >
                    {invitedIds.has(f.userId) ? t("room.waiting.invited") : t("room.waiting.invite")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Player list */}
        <div className={styles.playersSection}>
          <span className={styles.sectionLabel}>{t("room.waiting.playersLabel")}</span>
          <ul className={styles.playerList} aria-label={t("room.waiting.playersLabel")}>
            {room.seats.map((seat) => (
              <li key={seat.playerId} className={styles.playerItem}>
                <div className={styles.avatar} aria-hidden="true">
                  {seat.avatar ? (
                    <img src={seat.avatar} alt="" className={styles.avatarImg} />
                  ) : (
                    seat.nickname.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className={styles.playerInfo}>
                  <span className={styles.playerName}>
                    {seat.nickname}
                    <span className={styles.playerDisc}>#{seat.discriminator}</span>
                    {seat.playerId === user?.id && (
                      <span className={styles.youBadge}>{t("hokm.you")}</span>
                    )}
                  </span>
                  {seat.isHost && (
                    <span className={styles.hostBadge}>
                      <HostIcon />
                      {t("lobby.hostLabel")}
                    </span>
                  )}
                </div>
                {!seat.isHost && (
                  <span
                    className={`${styles.readyBadge} ${seat.ready ? styles.isReady : styles.notReady}`}
                  >
                    {seat.ready ? t("room.waiting.ready") : t("room.waiting.notReady")}
                  </span>
                )}
                <div
                  className={`${styles.statusDot} ${seat.connected ? styles.connected : styles.disconnected}`}
                  aria-label={seat.connected ? "Online" : "Offline"}
                />
              </li>
            ))}

            {/* Empty seat placeholders */}
            {Array.from({ length: Math.max(0, minPlayers - room.seats.length) }).map((_, i) => (
              <li key={`empty-${i}`} className={`${styles.playerItem} ${styles.emptySlot}`}>
                <div className={`${styles.avatar} ${styles.emptyAvatar}`} aria-hidden="true">?</div>
                <span className={styles.emptyLabel}>
                  {t("room.waiting.startHint", { min: minPlayers })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Start / wait hint */}
        {startError && (
          <p className={styles.error} role="alert">{startError}</p>
        )}

        {isHost ? (
          <>
            <button
              className={styles.startBtn}
              onClick={handleStart}
              disabled={!canStart || starting}
            >
              {starting ? "…" : t("room.waiting.startGame")}
            </button>
            {enoughPlayers && !allReady && (
              <p className={styles.waitHint}>{t("room.waiting.waitingReady")}</p>
            )}
          </>
        ) : (
          <>
            <button
              className={`${styles.readyToggle} ${myReady ? styles.readyToggleOn : ""}`}
              onClick={toggleReady}
              disabled={settingReady}
              aria-pressed={myReady}
            >
              {myReady ? t("room.waiting.cancelReady") : t("room.waiting.readyUp")}
            </button>
            <p className={styles.waitHint}>
              {myReady ? t("room.waiting.waitHint") : t("room.waiting.readyHint")}
            </p>
          </>
        )}

        {/* Leave — with inline confirmation */}
        {confirmLeave ? (
          <div className={styles.confirmLeave} role="alertdialog" aria-label={t("room.leave.confirm")}>
            <p className={styles.confirmMsg}>{t("room.leave.confirm")}</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmLeave(false)}>
                {t("room.leave.cancel")}
              </button>
              <button className={styles.confirmBtn} onClick={handleLeaveConfirmed}>
                {isHost ? t("room.leave.terminateRoom") : t("room.leave.leaveGame")}
              </button>
            </div>
          </div>
        ) : (
          <button className={styles.leaveBtn} onClick={() => setConfirmLeave(true)}>
            {t("room.waiting.leave")}
          </button>
        )}
      </div>
    </div>
  );
}

function HostIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
