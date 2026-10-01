import type { Response } from "express";
import type {
  NotificationChannel,
  PublishEvent,
  UnpublishEvent,
} from "./types.js";

// Proxies drop connections idle for a minute or so; a comment keeps them open
const HEARTBEAT_MS = 25_000;
// A client this far behind is dropped rather than buffered without bound
const MAX_BUFFERED_BYTES = 1024 * 1024;

export class SSEChannel implements NotificationChannel {
  #clients = new Set<Response>();
  #heartbeat: ReturnType<typeof setInterval> | undefined;

  addClient(res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      // NGINX would otherwise buffer the stream
      "X-Accel-Buffering": "no",
    });
    res.write("event: connected\ndata: {}\n\n");

    this.#clients.add(res);
    this.#heartbeat ??= setInterval(
      () => this.#send(": ping\n\n"),
      HEARTBEAT_MS,
    );
    this.#heartbeat.unref();
    res.on("close", () => {
      this.#clients.delete(res);
      if (this.#clients.size === 0) {
        clearInterval(this.#heartbeat);
        this.#heartbeat = undefined;
      }
    });
  }

  notifyPublish(event: PublishEvent): void {
    this.#broadcast("publish", event);
  }

  notifyUnpublish(event: UnpublishEvent): void {
    this.#broadcast("unpublish", event);
  }

  #broadcast(eventName: string, event: PublishEvent | UnpublishEvent): void {
    this.#send(`event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  #send(payload: string): void {
    for (const client of this.#clients) {
      if (client.writableLength > MAX_BUFFERED_BYTES) {
        client.destroy();
        this.#clients.delete(client);
        continue;
      }
      try {
        client.write(payload);
      } catch (err) {
        console.error("[registry] SSE client write failed:", err);
        this.#clients.delete(client);
      }
    }
  }
}
