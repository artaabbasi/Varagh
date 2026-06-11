import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@varagh/shared";

export const socket = io({
  autoConnect: false,
}) as Socket<ServerToClientEvents, ClientToServerEvents>;
