import { useState, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FriendEntry, RecentPlayer } from "@varagh/shared";
import { socket } from "../app/socket";
import { playSound } from "../app/sound";
import styles from "./FriendsPanel.module.css";

interface FriendsPanelProps {
  onInviteToJoin?: (roomCode: string, fromNickname: string) => void;
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={online ? styles.dotOnline : styles.dotOffline}
      aria-label={online ? "Online" : "Offline"}
    />
  );
}

export function FriendsPanel({ onInviteToJoin }: FriendsPanelProps) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [recent, setRecent] = useState<RecentPlayer[]>([]);
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = () => {
    socket.emit("friend:list", {}, (res) => {
      setFriends(res.friends);
    });
    socket.emit("friend:recentlyPlayed", {}, (res) => {
      if (res.ok) setRecent(res.players);
    });
  };

  useEffect(() => {
    refresh();

    const onRequest = ({ from }: { from: { userId: string; nickname: string; discriminator: string } }) => {
      playSound("friendRequest");
      setFriends((prev) => {
        if (prev.some((f) => f.userId === from.userId)) return prev;
        return [...prev, { ...from, status: "pending", incoming: true, online: true }];
      });
    };

    const onAccepted = ({ by }: { by: { userId: string; nickname: string; discriminator: string } }) => {
      setFriends((prev) =>
        prev.map((f) => f.userId === by.userId ? { ...f, status: "accepted" } : f)
      );
    };

    const onInvite = ({ from, roomCode }: { from: { userId: string; nickname: string; discriminator: string }; roomCode: string }) => {
      playSound("invite");
      onInviteToJoin?.(roomCode, `${from.nickname}#${from.discriminator}`);
    };

    socket.on("friend:request", onRequest);
    socket.on("friend:accepted", onAccepted);
    socket.on("friend:invite", onInvite);
    return () => {
      socket.off("friend:request", onRequest);
      socket.off("friend:accepted", onAccepted);
      socket.off("friend:invite", onInvite);
    };
  }, [onInviteToJoin]);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const parts = addInput.trim().split("#");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setAddError(t("friends.add.formatError"));
      return;
    }
    const [nickname, discriminator] = parts;
    setBusy((b) => ({ ...b, add: true }));
    socket.emit("friend:add", { nickname, discriminator }, (res) => {
      setBusy((b) => ({ ...b, add: false }));
      if (!res.ok) {
        setAddError(res.error === "User not found" ? t("friends.add.notFound") : res.error);
      } else {
        setAddSuccess(true);
        setAddInput("");
        setTimeout(() => setAddSuccess(false), 2000);
        refresh();
      }
    });
  };

  const handleAddRecent = (p: RecentPlayer) => {
    setBusy((b) => ({ ...b, [p.userId]: true }));
    socket.emit("friend:add", { nickname: p.nickname, discriminator: p.discriminator }, (res) => {
      setBusy((b) => ({ ...b, [p.userId]: false }));
      if (res.ok) {
        // Move them out of "recently played" and into the (pending) friends list.
        setRecent((prev) => prev.filter((r) => r.userId !== p.userId));
        setFriends((prev) =>
          prev.some((f) => f.userId === p.userId)
            ? prev
            : [...prev, { userId: p.userId, nickname: p.nickname, discriminator: p.discriminator, status: "pending", incoming: false, online: p.online }],
        );
      }
    });
  };

  const handleAccept = (userId: string) => {
    setBusy((b) => ({ ...b, [userId]: true }));
    socket.emit("friend:accept", { userId }, (res) => {
      setBusy((b) => ({ ...b, [userId]: false }));
      if (res.ok) {
        setFriends((prev) =>
          prev.map((f) => f.userId === userId ? { ...f, status: "accepted" } : f)
        );
      }
    });
  };

  const handleRemove = (userId: string) => {
    setBusy((b) => ({ ...b, [userId]: true }));
    socket.emit("friend:remove", { userId }, () => {
      setBusy((b) => ({ ...b, [userId]: false }));
      setFriends((prev) => prev.filter((f) => f.userId !== userId));
    });
  };

  const incoming = friends.filter((f) => f.status === "pending" && f.incoming);
  const outgoing = friends.filter((f) => f.status === "pending" && !f.incoming);
  const accepted = friends.filter((f) => f.status === "accepted");

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>{t("friends.title")}</h2>

      {/* Add friend */}
      <form onSubmit={handleAdd} className={styles.addForm} noValidate>
        <input
          className={styles.addInput}
          type="text"
          value={addInput}
          onChange={(e) => { setAddInput(e.target.value); setAddError(null); }}
          placeholder={t("friends.add.placeholder")}
          aria-label={t("friends.add.label")}
          disabled={busy["add"]}
        />
        <button
          type="submit"
          className={styles.addBtn}
          disabled={busy["add"] || !addInput.trim()}
          aria-label={t("friends.add.submit")}
        >
          {addSuccess ? "✓" : "+"}
        </button>
      </form>
      {addError && <p className={styles.addError} role="alert">{addError}</p>}

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>{t("friends.incoming")}</span>
          <ul className={styles.list}>
            {incoming.map((f) => (
              <li key={f.userId} className={styles.item}>
                <OnlineDot online={f.online} />
                <span className={styles.name}>{f.nickname}<span className={styles.disc}>#{f.discriminator}</span></span>
                <div className={styles.actions}>
                  <button
                    className={styles.acceptBtn}
                    onClick={() => handleAccept(f.userId)}
                    disabled={busy[f.userId]}
                    aria-label={t("friends.accept")}
                  >
                    {t("friends.accept")}
                  </button>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemove(f.userId)}
                    disabled={busy[f.userId]}
                    aria-label={t("friends.decline")}
                  >
                    {t("friends.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Accepted friends */}
      {accepted.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>
            {t("friends.title")} ({accepted.filter((f) => f.online).length}/{accepted.length} {t("friends.online")})
          </span>
          <ul className={styles.list}>
            {accepted
              .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0))
              .map((f) => (
                <li key={f.userId} className={styles.item}>
                  <OnlineDot online={f.online} />
                  <span className={styles.name}>{f.nickname}<span className={styles.disc}>#{f.discriminator}</span></span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemove(f.userId)}
                    disabled={busy[f.userId]}
                    aria-label={t("friends.remove")}
                    title={t("friends.remove")}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Pending outgoing */}
      {outgoing.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>{t("friends.pending")}</span>
          <ul className={styles.list}>
            {outgoing.map((f) => (
              <li key={f.userId} className={[styles.item, styles.itemMuted].join(" ")}>
                <OnlineDot online={f.online} />
                <span className={styles.name}>{f.nickname}<span className={styles.disc}>#{f.discriminator}</span></span>
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemove(f.userId)}
                  disabled={busy[f.userId]}
                  aria-label={t("friends.cancel")}
                  title={t("friends.cancel")}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recently played (not friends yet) */}
      {recent.length > 0 && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>{t("friends.recentlyPlayed")}</span>
          <ul className={styles.list}>
            {recent.map((p) => (
              <li key={p.userId} className={styles.item}>
                <OnlineDot online={p.online} />
                <span className={styles.name}>{p.nickname}<span className={styles.disc}>#{p.discriminator}</span></span>
                <button
                  className={styles.acceptBtn}
                  onClick={() => handleAddRecent(p)}
                  disabled={busy[p.userId]}
                  aria-label={t("friends.addFriend")}
                  title={t("friends.addFriend")}
                >
                  {t("friends.addFriend")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {friends.length === 0 && recent.length === 0 && (
        <p className={styles.empty}>{t("friends.noFriends")}</p>
      )}
    </div>
  );
}
