// Shim for socket.io-client: an inert socket — no AP server to talk to.
// never[] keeps arbitrary handler signatures assignable.
type Listener = (...args: never[]) => void;

export interface Socket {
  id: string | undefined;
  connected: boolean;
  on: (event: string, listener: Listener) => Socket;
  off: (event: string, listener?: Listener) => Socket;
  emit: (event: string, ...args: unknown[]) => Socket;
  removeAllListeners: (event?: string) => Socket;
}

export function createInertSocket(): Socket {
  const socket: Socket = {
    id: undefined,
    connected: false,
    on: () => socket,
    off: () => socket,
    emit: () => socket,
    removeAllListeners: () => socket,
  };
  return socket;
}
