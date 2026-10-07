import type { RpcMessage } from "./protocol.js";

export interface IRpcTransport {
  /**
   * Sends a message. `transfer` moves its entries (e.g. a MessagePort for the
   * adopt-sync-peer op) into the receiving realm rather than cloning them;
   * omit it for ordinary clone-safe messages.
   */
  post(message: RpcMessage, transfer?: Transferable[]): void;
  onMessage(listener: (message: RpcMessage) => void): () => void;
  close(): void;
}

export function createPortTransport(port: MessagePort): IRpcTransport {
  port.start();
  port.addEventListener("messageerror", (event) => {
    console.error("[rpc transport] failed to deserialize message", event);
  });
  return {
    post(message, transfer) {
      if (transfer && transfer.length > 0) {
        port.postMessage(message, transfer);
        return;
      }
      port.postMessage(message);
    },
    onMessage(listener) {
      const handler = (event: MessageEvent) => {
        listener(event.data as RpcMessage);
      };
      port.addEventListener("message", handler);
      return () => port.removeEventListener("message", handler);
    },
    close() {
      port.close();
    },
  };
}
