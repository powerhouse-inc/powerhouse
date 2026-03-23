import type { Response } from "express";
import type { NotificationChannel, PublishEvent } from "./types.js";

export class SSEChannel implements NotificationChannel {
  #clients = new Set<Response>();

  addClient(res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("event: connected\ndata: {}\n\n");

    this.#clients.add(res);
    res.on("close", () => {
      this.#clients.delete(res);
    });
  }

  notifyPublish(event: PublishEvent): void {
    const payload = `event: publish\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.#clients) {
      try {
        client.write(payload);
      } catch (err) {
        console.error("[registry] SSE client write failed:", err);
        this.#clients.delete(client);
      }
    }
  }
}
