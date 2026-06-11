import { createServer } from "http";
import { mkdirSync } from "fs";
import { dirname } from "path";
import express from "express";
import { Server } from "socket.io";
import { DatabaseSync } from "node:sqlite";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "@varagh/shared";
import { createAuthStore } from "./auth/store";
import { RoomStore } from "./rooms/room-store";
import { registerHandlers } from "./transport/handlers";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DATABASE_URL ?? "data/varagh.db";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

mkdirSync(dirname(DB_PATH), { recursive: true });

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { cors: { origin: WEB_ORIGIN } }
);

const db = new DatabaseSync(DB_PATH);
const authStore = createAuthStore(db);
const roomStore = new RoomStore();

registerHandlers(io, authStore, roomStore);

httpServer.listen(PORT, () => {
  console.log(`Varagh server listening on :${PORT}  (db: ${DB_PATH})`);
});
