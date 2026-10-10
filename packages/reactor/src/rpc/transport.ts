import type { RpcMessage } from "./protocol.js";

export interface IRpcTransport {
  /** `transfer` moves its entries, such as a MessagePort, instead of cloning them. */
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
