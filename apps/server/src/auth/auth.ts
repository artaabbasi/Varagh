import { randomBytes, createHash } from "crypto";
import type { AuthStore, User } from "./store";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashToken(token: string): string {
  return sha256(token);
}

export function hashPassword(password: string): string {
  return sha256(password);
}

export function signup(
  store: AuthStore,
  username: string,
  displayName: string,
  password: string,
): { token: string; user: User } {
  const token = randomBytes(32).toString("hex");
  const passwordHash = hashPassword(password);
  const user = store.createUser(username, displayName, hashToken(token), passwordHash);
  return { token, user };
}

export function login(store: AuthStore, token: string): User | null {
  return store.findByTokenHash(hashToken(token)) ?? null;
}

export function loginWithPassword(
  store: AuthStore,
  username: string,
  password: string,
): { token: string; user: User } | null {
  const user = store.findByUsernameAndPasswordHash(username, hashPassword(password));
  if (!user) return null;
  const token = randomBytes(32).toString("hex");
  store.updateTokenHash(user.id, hashToken(token));
  return { token, user };
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
