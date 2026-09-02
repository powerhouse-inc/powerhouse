// Shim for @/components/providers/socket-provider.
import { createInertSocket, type Socket } from "./socket.js";

const socket = createInertSocket();

export function useSocket(): Socket {
  return socket;
}
