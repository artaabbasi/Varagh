import { randomBytes, createHash } from "crypto";
import type { AuthStore, User } from "./store";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashToken(token: string): string {
  return sha256(token);
}

export function signup(store: AuthStore, nickname: string): { token: string; user: User } {
  const token = randomBytes(32).toString("hex");
  const user = store.createUser(nickname, hashToken(token));
  return { token, user };
}

export function login(store: AuthStore, token: string): User | null {
  return store.findByTokenHash(hashToken(token)) ?? null;
}

export function recoverWithPin(
  store: AuthStore,
  nickname: string,
  pin: string
): { token: string; user: User } | null {
  const user = store.findByNicknameAndPinHash(nickname, sha256(pin));
  if (!user) return null;
  const token = randomBytes(32).toString("hex");
  store.updateTokenHash(user.id, hashToken(token));
  return { token, user };
}
