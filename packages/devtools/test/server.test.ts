import type { IncomingMessage } from "node:http";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DevStackInfo,
  ProjectFileList,
  ProjectDocumentModelDetail,
  ProjectFileText,
  ProjectSnapshot,
} from "../src/api.js";
import { loopbackHost, sameOrigin } from "../src/server/guards.js";
import {
  createDevtoolsApiHandler,
  createDevtoolsToken,
  DEVTOOLS_TOKEN_HEADER,
  type ProjectReader,
} from "../src/server/index.js";
import { stackInfo } from "./stack.fixture.js";

const INFO = stackInfo({
  project: { name: "my-project", version: "1.2.3" },
});

const TOKEN = createDevtoolsToken();

type Answer = {
  status: number;
  headers: IncomingMessage["headers"];
  body: string;
};

function call(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method, headers },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function serve(options: {
  base?: string;
  info?: () => DevStackInfo | Promise<DevStackInfo>;
  project?: ProjectReader;
}): Promise<Server> {
  const api = createDevtoolsApiHandler({
    token: TOKEN,
    base: options.base,
    info: options.info ?? (() => INFO),
    project: options.project,
  });
  const server = createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 200;
      res.end("fallback");
    }),
  );
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

const portOf = (server: Server) => (server.address() as AddressInfo).port;
const errorCode = (answer: Answer) =>
  (JSON.parse(answer.body) as { error: { code: string } }).error.code;

describe("the DevTools API", () => {
  let server: Server;
  let port: number;
  let host: Record<string, string>;
  let page: Record<string, string>;

  beforeAll(async () => {
    server = await serve({});
    port = portOf(server);
    host = { host: `localhost:${port}` };
    page = { ...host, [DEVTOOLS_TOKEN_HEADER]: TOKEN };
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("answers the page that carries the token", async () => {
    const answer = await call(port, "/__ph/devtools/api/info", page);
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual(INFO);
    expect(answer.headers["cache-control"]).toBe("no-store");
    expect(answer.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("answers a browser's same-origin request", async () => {
    const answer = await call(port, "/__ph/devtools/api/info", {
      ...page,
      origin: `http://localhost:${port}`,
      "sec-fetch-site": "same-origin",
    });
    expect(answer.status).toBe(200);
  });

  it.each([
    ["no token", {}],
    ["a wrong token of the same length", { t: createDevtoolsToken() }],
    ["a shorter token", { t: TOKEN.slice(1) }],
    ["an empty token", { t: "" }],
  ])("refuses %s", async (_, { t }: { t?: string }) => {
    const answer = await call(port, "/__ph/devtools/api/info", {
      ...host,
      ...(t === undefined ? {} : { [DEVTOOLS_TOKEN_HEADER]: t }),
    });
    expect(answer.status).toBe(401);
    expect(errorCode(answer)).toBe("bad_token");
    expect(answer.body).not.toContain("my-project");
  });

  it.each([
    ["another site's name", "evil.example"],
    ["another site's name on this port", `evil.example:${0}`],
    ["a LAN address", "192.168.1.20:3000"],
    ["loopback on another port", "localhost:1"],
    ["a name that only starts like loopback", "localhost.evil.example"],
  ])("refuses a Host that is %s, token or not", async (_, name) => {
    const answer = await call(port, "/__ph/devtools/api/info", {
      ...page,
      host: name.endsWith(":0") ? name.replace(":0", `:${port}`) : name,
    });
    expect(answer.status).toBe(403);
    expect(errorCode(answer)).toBe("bad_host");
  });

  it.each([
    ["another loopback port", { origin: "http://localhost:1" }],
    ["another site", { origin: "https://evil.example" }],
    ["the same host over https", { origin: "https://localhost:0" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a same-site fetch", { "sec-fetch-site": "same-site" }],
  ])("refuses a request from %s, token or not", async (_, headers) => {
    const sent = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        value.replace(":0", `:${port}`),
      ]),
    );
    const answer = await call(port, "/__ph/devtools/api/info", {
      ...page,
      ...sent,
    });
    expect(answer.status).toBe(403);
    expect(errorCode(answer)).toBe("bad_origin");
  });

  it("guards a route it does not have, and a method it does not take", async () => {
    const unknown = await call(port, "/__ph/devtools/api/config", host);
    expect(unknown.status).toBe(401);
    const known = await call(port, "/__ph/devtools/api/config", page);
    expect(known.status).toBe(404);
    expect(errorCode(known)).toBe("not_found");
    const post = await call(port, "/__ph/devtools/api/info", page, "POST");
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe("GET");
  });

  it.each([
    "/",
    "/__ph/devtools",
    "/__ph/devtools/",
    "/__ph/devtools/apix",
    "/__ph/devtools/apiinfo",
    "/other/__ph/devtools/api/info",
  ])("leaves %s to the dev server", async (path) => {
    const answer = await call(port, path, host);
    expect(answer.status).toBe(200);
    expect(answer.body).toBe("fallback");
  });

  it("leaves a request target that is no URL to the dev server", async () => {
    const answer = await call(port, "//", host);
    expect(answer.status).toBe(200);
    expect(answer.body).toBe("fallback");
  });

  it.each([
    ["forwarded", "for=203.0.113.7"],
    ["x-forwarded-for", "203.0.113.7"],
    ["x-forwarded-host", "tunnel.example"],
    ["x-real-ip", "203.0.113.7"],
    ["via", "1.1 proxy"],
  ])("refuses a request a proxy forwarded (%s)", async (name, value) => {
    const answer = await call(port, "/__ph/devtools/api/info", {
      ...page,
      [name]: value,
    });
    expect(answer.status).toBe(403);
    expect(errorCode(answer)).toBe("bad_host");
  });

  it("ignores the query string when it matches a route", async () => {
    const answer = await call(port, "/__ph/devtools/api/info?x=1", page);
    expect(answer.status).toBe(200);
  });
});

describe("the DevTools API under a base path", () => {
  it("answers below the base and at the bare path", async () => {
    const server = await serve({ base: "/app/" });
    const port = portOf(server);
    const page = { host: `127.0.0.1:${port}`, [DEVTOOLS_TOKEN_HEADER]: TOKEN };
    try {
      for (const path of [
        "/app/__ph/devtools/api/info",
        "/__ph/devtools/api/info",
      ]) {
        expect((await call(port, path, page)).status).toBe(200);
      }
      const page404 = await call(port, "/app/__ph/devtools", page);
      expect(page404.body).toBe("fallback");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it("answers 500, without a stack, when the project cannot be read", async () => {
    const server = await serve({
      info: () => Promise.reject(new Error("package.json is gone")),
    });
    const port = portOf(server);
    try {
      const answer = await call(port, "/__ph/devtools/api/info", {
        host: `localhost:${port}`,
        [DEVTOOLS_TOKEN_HEADER]: TOKEN,
      });
      expect(answer.status).toBe(500);
      expect(JSON.parse(answer.body)).toEqual({
        error: { code: "internal", message: "package.json is gone" },
      });
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});

describe("the loopback guards", () => {
  const req = (
    socket: { localAddress?: string; localPort?: number; encrypted?: boolean },
    headers: Record<string, string>,
  ) => ({ socket, headers }) as unknown as IncomingMessage;

  it("refuses a socket that did not accept on loopback, whatever Host it sends", () => {
    for (const localAddress of [
      "192.168.1.5",
      "10.0.0.2",
      "::ffff:10.0.0.2",
      undefined,
    ]) {
      expect(
        loopbackHost(
          req({ localAddress, localPort: 3000 }, { host: "localhost:3000" }),
        ),
      ).toBeUndefined();
    }
  });

  it("accepts each loopback spelling on the accepted port", () => {
    for (const [localAddress, host] of [
      ["127.0.0.1", "localhost:3000"],
      ["127.0.0.1", "127.0.0.1:3000"],
      ["::1", "[::1]:3000"],
      ["::ffff:127.0.0.1", "LOCALHOST:3000"],
    ]) {
      expect(
        loopbackHost(req({ localAddress, localPort: 3000 }, { host })),
      ).toBe(host.toLowerCase());
    }
  });

  it("reads the host of an HTTP/2 request, which has no Host header", () => {
    const tls = { localAddress: "127.0.0.1", localPort: 3000, encrypted: true };
    expect(loopbackHost(req(tls, { ":authority": "localhost:3000" }))).toBe(
      "localhost:3000",
    );
    expect(
      loopbackHost(req(tls, { ":authority": "evil.example:3000" })),
    ).toBeUndefined();
  });

  it("reads a Host without a port as the scheme's default", () => {
    const plain = { localAddress: "127.0.0.1", localPort: 80 };
    expect(loopbackHost(req(plain, { host: "localhost" }))).toBe("localhost");
    expect(
      loopbackHost(req({ ...plain, localPort: 3000 }, { host: "localhost" })),
    ).toBeUndefined();
    const tls = { localAddress: "127.0.0.1", localPort: 443, encrypted: true };
    expect(loopbackHost(req(tls, { host: "localhost" }))).toBe("localhost");
  });

  it("compares the Origin with the scheme the socket speaks", () => {
    const tls = { localAddress: "127.0.0.1", localPort: 3000, encrypted: true };
    const host = "localhost:3000";
    expect(
      sameOrigin(req(tls, { host, origin: `https://${host}` }), host),
    ).toBe(true);
    expect(sameOrigin(req(tls, { host, origin: `http://${host}` }), host)).toBe(
      false,
    );
  });
});

describe("the project routes", () => {
  const SNAPSHOT = { revision: "r1", root: "/project" } as ProjectSnapshot;
  const MODEL = {
    revision: "r1",
    documentType: "acme/invoice",
  } as ProjectDocumentModelDetail;
  const FILE_LIST: ProjectFileList = { revision: "r1", modules: [] };
  const FILE: ProjectFileText = {
    revision: "r1",
    path: "editors/invoice-editor/editor.tsx",
    text: "export default function Editor() {}\n",
    truncated: false,
  };

  let server: Server;
  let port: number;
  let page: Record<string, string>;
  let reads = 0;
  const asked: string[] = [];

  beforeAll(async () => {
    server = await serve({
      project: {
        revision: () => "r1",
        snapshot: () => {
          reads++;
          return Promise.resolve(SNAPSHOT);
        },
        documentModel: (documentType) => {
          asked.push(documentType);
          return Promise.resolve(
            documentType === MODEL.documentType ? MODEL : undefined,
          );
        },
        fileList: () => Promise.resolve(FILE_LIST),
        file: (path) => {
          asked.push(path);
          return Promise.resolve(path === FILE.path ? FILE : undefined);
        },
      },
    });
    port = portOf(server);
    page = { host: `localhost:${port}`, [DEVTOOLS_TOKEN_HEADER]: TOKEN };
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  const get = (path: string, headers: Record<string, string> = {}) =>
    call(port, `/__ph/devtools/api/${path}`, { ...page, ...headers });

  it("answers the snapshot with its revision as the ETag", async () => {
    const answer = await get("project");
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual(SNAPSHOT);
    expect(answer.headers.etag).toBe('"r1"');
  });

  it("answers 304 without reading when the caller has the revision", async () => {
    const before = reads;
    const answer = await get("project", { "if-none-match": '"r1"' });
    expect(answer.status).toBe(304);
    expect(answer.body).toBe("");
    expect(reads).toBe(before);
  });

  it("reads again for a caller that has another revision", async () => {
    const answer = await get("project", { "if-none-match": '"r0"' });
    expect(answer.status).toBe(200);
  });

  it("answers one document model by its escaped type", async () => {
    const answer = await get("project/document-models/acme%2Finvoice");
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual(MODEL);
    expect(asked.at(-1)).toBe("acme/invoice");
  });

  it("answers one file's text by its escaped path", async () => {
    const answer = await get(`project/files/${encodeURIComponent(FILE.path)}`);
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual(FILE);
    expect(answer.headers.etag).toBe('"r1"');
    expect(asked.at(-1)).toBe(FILE.path);
  });

  it("answers 304 for a file the caller has at this revision", async () => {
    const answer = await get(`project/files/${encodeURIComponent(FILE.path)}`, {
      "if-none-match": '"r1"',
    });
    expect(answer.status).toBe(304);
    expect(answer.body).toBe("");
  });

  it.each(["project/nope", "project/files/package.json"])(
    "answers not_found for %s whatever revision the caller has",
    async (path) => {
      const answer = await get(path, { "if-none-match": '"r1"' });
      expect(answer.status).toBe(404);
    },
  );

  it.each([
    "project/document-models/acme%2Fmissing",
    "project/document-models/%E0%A4%A",
    "project/files/",
    "project/files/package.json",
    `project/files/${encodeURIComponent("../outside.ts")}`,
    "project/files/%E0%A4%A",
  ])("answers not_found for %s", async (path) => {
    const answer = await get(path);
    expect(answer.status).toBe(404);
    expect(errorCode(answer)).toBe("not_found");
  });

  it("answers each module's files", async () => {
    const answer = await get("project/files");
    expect(JSON.parse(answer.body)).toEqual(FILE_LIST);
  });

  it("refuses a request without the token", async () => {
    const answer = await call(port, "/__ph/devtools/api/project", {
      host: `localhost:${port}`,
    });
    expect(errorCode(answer)).toBe("bad_token");
  });

  it("answers GET only", async () => {
    const answer = await call(port, "/__ph/devtools/api/project", page, "POST");
    expect(errorCode(answer)).toBe("bad_method");
  });
});

describe("a dev server that does not read the project", () => {
  it("has no project routes", async () => {
    const server = await serve({});
    const port = portOf(server);
    const answer = await call(port, "/__ph/devtools/api/project", {
      host: `localhost:${port}`,
      [DEVTOOLS_TOKEN_HEADER]: TOKEN,
    });
    expect(errorCode(answer)).toBe("not_found");
    await new Promise<void>((done) => server.close(() => done()));
  });
});
