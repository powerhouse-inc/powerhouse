import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal in-process S3 mock for path-style requests
 * (`<METHOD> /<bucket>/<key>`). Enough of the object API for the auth plugin's
 * JSON store: PUT / GET / HEAD / DELETE. Ignores auth/signatures. The request
 * path (after `/<bucket>/`) is the map key verbatim, so PUT and GET round-trip
 * consistently regardless of key encoding.
 */
export interface MockS3 {
  server: Server;
  endpoint: string;
  store: Map<string, Buffer>;
  has(key: string): boolean;
  close(): Promise<void>;
}

export async function startMockS3(bucket: string): Promise<MockS3> {
  const store = new Map<string, Buffer>();
  const prefix = `/${bucket}/`;

  const server = createServer((req, res) => {
    const url = req.url ?? "";
    const pathOnly = url.split("?")[0];
    const key = pathOnly.startsWith(prefix)
      ? pathOnly.slice(prefix.length)
      : pathOnly.replace(/^\//, "");

    const notFound = () => {
      res.statusCode = 404;
      res.setHeader("content-type", "application/xml");
      res.end(
        `<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>`,
      );
    };

    switch (req.method) {
      case "PUT": {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c as Buffer));
        req.on("end", () => {
          store.set(key, Buffer.concat(chunks));
          res.setHeader("ETag", '"mock"');
          res.statusCode = 200;
          res.end();
        });
        return;
      }
      case "GET": {
        const val = store.get(key);
        if (!val) return notFound();
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(val);
        return;
      }
      case "HEAD": {
        if (!store.has(key)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.end();
        return;
      }
      case "DELETE": {
        store.delete(key);
        res.statusCode = 204;
        res.end();
        return;
      }
      default:
        res.statusCode = 405;
        res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    server,
    endpoint: `http://127.0.0.1:${port}`,
    store,
    has: (key: string) => store.has(key),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
