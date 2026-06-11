import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomInt } from "crypto";

export interface User {
  id: string;
  nickname: string;
  discriminator: string;
}

export interface AuthStore {
  createUser(nickname: string, tokenHash: string): User;
  findByTokenHash(tokenHash: string): User | undefined;
  updateTokenHash(userId: string, tokenHash: string): void;
  setPin(userId: string, pinHash: string): void;
  findByNicknameAndPinHash(nickname: string, pinHash: string): User | undefined;
}

export function createAuthStore(db: DatabaseSync): AuthStore {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      nickname      TEXT NOT NULL,
      discriminator TEXT NOT NULL,
      token_hash    TEXT UNIQUE NOT NULL,
      pin_hash      TEXT
    )
  `);

  return {
    createUser(nickname, tokenHash) {
      const id = randomUUID();
      const discriminator = String(randomInt(1000, 9999));
      db.prepare(
        "INSERT INTO users (id, nickname, discriminator, token_hash) VALUES (?, ?, ?, ?)"
      ).run(id, nickname, discriminator, tokenHash);
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
  };
}
