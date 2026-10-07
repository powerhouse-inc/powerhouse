/**
 * The environment-neutral transport {@link LocalChannel} speaks over.
 *
 * A LocalChannel never touches a real MessagePort directly: it depends only on
 * this interface so the same channel runs over a browser MessagePort, a
 * `node:worker_threads` MessagePort, or an in-process stub in a test. Whatever
 * crosses `postMessage` must be structured-clone-safe -- plain data, never a
 * function or a closure -- because a real port clones it.
 */
export interface LocalChannelPort {
  /** Sends one structured-clone-safe message to the peer. */
  postMessage(data: unknown): void;
  /**
   * Registers a listener for messages from the peer. Returns a function that
   * removes it; a port may have at most the listeners its callers register.
   */
  onMessage(callback: (data: unknown) => void): () => void;
  /** Releases the transport. Idempotent; the registrant calls it, not a channel. */
  close(): void;
}

/**
 * Resolves the transport for a remote from its channel config.
 *
 * The factory holds one of these rather than taking a port directly, because
 * {@link IChannelFactory.instance} has no seam for a live object and a port is
 * not clone-safe config. W1.2 supplies a real brokered MessagePort by keying it
 * here under the same (peerId, channelName) the config names, with no change to
 * the channel.
 *
 * Returns undefined when nothing is registered for the key; the factory turns
 * that into a thrown error so a misconfigured remote fails loudly at init.
 */
export type LocalChannelTransportProvider = (
  peerId: string,
  channelName: string,
) => LocalChannelPort | undefined;

/**
 * The shape both a browser MessagePort and a `node:worker_threads` MessagePort
 * satisfy, narrowed to what {@link messagePortTransport} uses. Neither global
 * MessagePort type is in scope in this package, so the adapter is written
 * against this structural type instead.
 */
export interface MessagePortLike {
  postMessage(value: unknown): void;
  close(): void;
  on?(event: "message", listener: (value: unknown) => void): unknown;
  off?(event: "message", listener: (value: unknown) => void): unknown;
  addEventListener?(type: "message", listener: (event: unknown) => void): void;
  removeEventListener?(
    type: "message",
    listener: (event: unknown) => void,
  ): void;
  start?(): void;
}

/**
 * Wraps a real MessagePort as a {@link LocalChannelPort}.
 *
 * A `node:worker_threads` port is an EventEmitter, so the EventEmitter surface
 * (`on`/`off`) is preferred when present; attaching a `message` listener there
 * also begins delivery, and messages posted before it attaches are buffered. A
 * browser port is driven through `addEventListener` and needs an explicit
 * `start()`, whose event carries the payload on `.data`.
 *
 * The browser branch has no Node test coverage in W1.1; it needs a real-browser
 * pass in W1.2/W1.3.
 */
export function messagePortTransport(port: MessagePortLike): LocalChannelPort {
  return {
    postMessage(data: unknown): void {
      port.postMessage(data);
    },
    onMessage(callback: (data: unknown) => void): () => void {
      if (typeof port.on === "function" && typeof port.off === "function") {
        const listener = (value: unknown): void => callback(value);
        port.on("message", listener);
        return () => {
          port.off?.("message", listener);
        };
      }
      const listener = (event: unknown): void => {
        callback((event as { data: unknown }).data);
      };
      port.addEventListener?.("message", listener);
      port.start?.();
      return () => {
        port.removeEventListener?.("message", listener);
      };
    },
    close(): void {
      port.close();
    },
  };
}
