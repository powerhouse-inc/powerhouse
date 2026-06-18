import type { RpcMessage } from "./protocol.js";

export interface IRpcTransport {
  post(message: RpcMessage): void;
  onMessage(listener: (message: RpcMessage) => void): () => void;
  close(): void;
}

export function createPortTransport(port: MessagePort): IRpcTransport {
  port.start();
  return {
    post(message) {
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
