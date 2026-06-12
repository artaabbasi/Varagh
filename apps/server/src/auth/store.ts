import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomInt } from "crypto";
import type { MatchHistoryEntry } from "@varagh/shared";

export interface User {
  id: string;
  nickname: string;
  discriminator: string;
}

export interface FriendRow {
  userId: string;
  nickname: string;
  discriminator: string;
  status: "pending" | "accepted";
  incoming: boolean;
}

export interface AuthStore {
  createUser(nickname: string, tokenHash: string, passwordHash?: string): User;
  findByTokenHash(tokenHash: string): User | undefined;
  updateTokenHash(userId: string, tokenHash: string): void;
  setPin(userId: string, pinHash: string): void;
  findByNicknameAndPinHash(nickname: string, pinHash: string): User | undefined;
  findByNicknameAndPasswordHash(nickname: string, passwordHash: string): User | undefined;
  updatePasswordHash(userId: string, passwordHash: string): void;
  getTotalUsers(): number;
  findByNicknameAndDiscriminator(nickname: string, discriminator: string): User | undefined;

  addFriendRequest(requesterId: string, targetId: string): void;
  acceptFriendRequest(requesterId: string, targetId: string): void;
  removeFriend(userId: string, otherId: string): void;
  getFriends(userId: string): FriendRow[];

  saveMatch(
    matchId: string,
    gameId: string,
    variantId: string,
    startedAt: number,
    endedAt: number,
    players: Array<{ id: string; nickname: string; score: string; isWinner: boolean }>,
  ): void;
  getUserHistory(userId: string, limit?: number): MatchHistoryEntry[];
}

export function createAuthStore(db: DatabaseSync): AuthStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      nickname      TEXT NOT NULL,
      discriminator TEXT NOT NULL,
      token_hash    TEXT UNIQUE NOT NULL,
      pin_hash      TEXT,
      password_hash TEXT
    )
  `);

  // Migrate pre-existing databases that lack newer columns
  const userColumns = (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map(c => c.name);
  if (!userColumns.includes("password_hash")) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      requester_id TEXT NOT NULL,
      target_id    TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   INTEGER NOT NULL,
      PRIMARY KEY (requester_id, target_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id          TEXT PRIMARY KEY,
      game_id     TEXT NOT NULL,
      variant_id  TEXT NOT NULL,
      started_at  INTEGER NOT NULL,
      ended_at    INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS match_players (
      match_id   TEXT NOT NULL,
      player_id  TEXT NOT NULL,
      nickname   TEXT NOT NULL,
      score      TEXT NOT NULL,
      is_winner  INTEGER NOT NULL,
      PRIMARY KEY (match_id, player_id)
    )
  `);

  return {
    createUser(nickname, tokenHash, passwordHash?) {
      const id = randomUUID();
      const discriminator = String(randomInt(1000, 9999));
      db.prepare(
        "INSERT INTO users (id, nickname, discriminator, token_hash, password_hash) VALUES (?, ?, ?, ?, ?)"
      ).run(id, nickname, discriminator, tokenHash, passwordHash ?? null);
      return { id, nickname, discriminator };
    },

    findByTokenHash(tokenHash) {
      return db
        .prepare("SELECT id, nickname, discriminator FROM users WHERE token_hash = ?")
        .get(tokenHash) as User | undefined;
    },

    updateTokenHash(userId, tokenHash) {
      db.prepare("UPDATE users SET token_hash = ? WHERE id = ?").run(tokenHash, userId);
    },

    setPin(userId, pinHash) {
      db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(pinHash, userId);
    },

    findByNicknameAndPinHash(nickname, pinHash) {
      return db
        .prepare(
          "SELECT id, nickname, discriminator FROM users WHERE nickname = ? AND pin_hash = ?"
        )
        .get(nickname, pinHash) as User | undefined;
    },

    findByNicknameAndPasswordHash(nickname, passwordHash) {
      return db
        .prepare(
          "SELECT id, nickname, discriminator FROM users WHERE nickname = ? AND password_hash = ?"
        )
        .get(nickname, passwordHash) as User | undefined;
    },

    updatePasswordHash(userId, passwordHash) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(userId, passwordHash);
    },

    getTotalUsers() {
      const row = db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
      return row.n;
    },

    findByNicknameAndDiscriminator(nickname, discriminator) {
      return db
        .prepare("SELECT id, nickname, discriminator FROM users WHERE nickname = ? AND discriminator = ?")
        .get(nickname, discriminator) as User | undefined;
    },

    addFriendRequest(requesterId, targetId) {
      db.prepare(
        "INSERT OR IGNORE INTO friends (requester_id, target_id, status, created_at) VALUES (?, ?, 'pending', ?)"
      ).run(requesterId, targetId, Date.now());
    },

    acceptFriendRequest(requesterId, targetId) {
      db.prepare(
        "UPDATE friends SET status = 'accepted' WHERE requester_id = ? AND target_id = ?"
      ).run(requesterId, targetId);
    },

    removeFriend(userId, otherId) {
      db.prepare(
        "DELETE FROM friends WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)"
      ).run(userId, otherId, otherId, userId);
    },

    getFriends(userId) {
      const rows = db.prepare(`
        SELECT
          CASE WHEN f.requester_id = ? THEN f.target_id ELSE f.requester_id END as friendId,
          f.status,
          CASE WHEN f.requester_id = ? THEN 0 ELSE 1 END as incoming
        FROM friends f
        WHERE f.requester_id = ? OR f.target_id = ?
      `).all(userId, userId, userId, userId) as Array<{ friendId: string; status: string; incoming: number }>;

      return rows.map((row) => {
        const user = db
          .prepare("SELECT id, nickname, discriminator FROM users WHERE id = ?")
          .get(row.friendId) as User | undefined;
        if (!user) return null;
        return {
          userId: user.id,
          nickname: user.nickname,
          discriminator: user.discriminator,
          status: row.status as "pending" | "accepted",
          incoming: row.incoming === 1,
        };
      }).filter((r): r is FriendRow => r !== null);
    },

    saveMatch(matchId, gameId, variantId, startedAt, endedAt, players) {
      db.prepare(
        "INSERT OR IGNORE INTO matches (id, game_id, variant_id, started_at, ended_at) VALUES (?, ?, ?, ?, ?)"
      ).run(matchId, gameId, variantId, startedAt, endedAt);
      for (const p of players) {
        db.prepare(
          "INSERT OR IGNORE INTO match_players (match_id, player_id, nickname, score, is_winner) VALUES (?, ?, ?, ?, ?)"
        ).run(matchId, p.id, p.nickname, p.score, p.isWinner ? 1 : 0);
      }
    },

    getUserHistory(userId, limit = 20) {
      const rows = db
        .prepare(
          `SELECT
             m.id as matchId, m.game_id as gameId, m.variant_id as variantId,
             m.ended_at as endedAt,
             mp.is_winner as isWinner, mp.score
           FROM matches m
           JOIN match_players mp ON m.id = mp.match_id
           WHERE mp.player_id = ?
           ORDER BY m.ended_at DESC
           LIMIT ?`
        )
        .all(userId, limit) as Array<{
          matchId: string; gameId: string; variantId: string;
          endedAt: number; isWinner: number; score: string;
        }>;

      return rows.map((row) => {
        const opponents = db
          .prepare(
            "SELECT nickname FROM match_players WHERE match_id = ? AND player_id != ?"
          )
          .all(row.matchId, userId) as Array<{ nickname: string }>;
        return {
          matchId: row.matchId,
          gameId: row.gameId,
          variantId: row.variantId,
          endedAt: row.endedAt,
          isWinner: row.isWinner === 1,
          score: row.score,
          opponents: opponents.map((o) => o.nickname),
        };
      });
    },
  };
}
