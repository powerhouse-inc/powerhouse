/**
 * One package whose subgraphs index exports a BaseSubgraph subclass and a
 * code-first Subgraph subclass, loaded from `packages.list` the way a local
 * project is. Both serve through the switchboard supergraph: the schema-first
 * query, the code-first query and mutation, the code-first subscription
 * beside the built-in `r` subgraph's on the supergraph's SSE stream, and
 * `r`'s over the WebSocket endpoint.
 */
import { documentModelDocumentModelModule, type ILogger } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/mixed-subgraphs", import.meta.url),
);

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

let tempRoot: string;
let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;
let origin: string;
const cleanups: (() => void)[] = [];

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "switchboard-mixed-package-"));
  const configFile = join(tempRoot, "powerhouse.config.json");
  await writeFile(configFile, "{}");
  switchboard = await bootSwitchboard(
    {
      server: { port: 0 },
      storage: {
        reactor: { url: join(tempRoot, "reactor") },
        readModel: { url: join(tempRoot, "read-model") },
        userDataDir: tempRoot,
      },
      features: { workflows: false, mcp: false },
      packages: { disableLocal: true, list: [FIXTURE] },
      identity: { keypairPath: join(tempRoot, "identity.json") },
      configFile,
    },
    { logger: stubLogger() },
    {},
  );
  origin = `http://127.0.0.1:${switchboard.port}`;
}, 120_000);

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

afterAll(async () => {
  try {
    await switchboard?.shutdown();
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

async function post(query: string): Promise<unknown> {
  const response = await fetch(`${origin}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

/** Every `next` payload of a subscription over the graphql-transport-ws endpoint. */
function overWebSocket(query: string): unknown[] {
  const events: unknown[] = [];
  const socket = new WebSocket(
    `ws://127.0.0.1:${switchboard!.port}/graphql/subscriptions`,
    "graphql-transport-ws",
  );
  socket.onopen = () =>
    socket.send(JSON.stringify({ type: "connection_init", payload: {} }));
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data)) as {
      type: string;
      payload?: unknown;
    };
    if (message.type === "connection_ack") {
      socket.send(
        JSON.stringify({ id: "1", type: "subscribe", payload: { query } }),
      );
    } else if (message.type === "next") {
      events.push(message.payload);
    } else if (message.type === "error") {
      events.push({ error: message.payload });
    }
  };
  cleanups.push(() => socket.close());
  return events;
}

/** Every `next` payload of a subscription over the supergraph's SSE stream. */
function overSse(query: string): unknown[] {
  const events: unknown[] = [];
  const controller = new AbortController();
  cleanups.push(() => controller.abort());
  void (async () => {
    const response = await fetch(`${origin}/graphql/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of response.body!) {
      text += decoder.decode(chunk as Uint8Array, { stream: true });
      const frames = text.split("\n\n");
      text = frames.pop() ?? "";
      for (const frame of frames) {
        const data = /^data: (.*)$/m.exec(frame)?.[1];
        if (frame.startsWith("event: next") && data !== undefined) {
          events.push(JSON.parse(data));
        }
      }
    }
  })().catch(() => undefined);
  return events;
}

const until = (events: unknown[], count: number) =>
  vi.waitFor(() => expect(events.length).toBeGreaterThanOrEqual(count), {
    timeout: 15_000,
    interval: 50,
  });

const DOCUMENT_CHANGES = `subscription {
  documentChanges(search: { type: "powerhouse/document-model" }) {
    type
    documents { id name documentType }
  }
}`;

/** Creates documents named `<prefix>-<n>` until `events` holds one, and checks it is that creation. */
async function expectDocumentCreation(events: unknown[], prefix: string) {
  const created = new Map<string, string>();
  // A subscription is live some time after it is sent, and nothing tells
  // the client when, so create a document until one arrives.
  let n = 0;
  await vi.waitFor(
    async () => {
      if (events.length === 0) {
        const document =
          documentModelDocumentModelModule.utils.createDocument();
        document.header.name = `${prefix}-${n++}`;
        const stored = await switchboard!.reactor.create(document);
        created.set(document.header.name, stored.header.id);
      }
      expect(events.length).toBeGreaterThan(0);
    },
    { timeout: 15_000, interval: 200 },
  );
  const event = events[0] as {
    data: { documentChanges: { documents: { name: string }[] } };
  };
  const name = event.data.documentChanges.documents[0]?.name ?? "";
  expect(name).toMatch(new RegExp(`^${prefix}-\\d+$`));
  expect(event).toEqual({
    data: {
      documentChanges: {
        type: "CREATED",
        documents: [
          {
            id: created.get(name),
            name,
            documentType: "powerhouse/document-model",
          },
        ],
      },
    },
  });
}

describe("a package with a schema-first and a code-first subgraph", () => {
  it("answers the schema-first query through the supergraph", async () => {
    expect(await post('{ greeting(to: "Ada") }')).toEqual({
      data: { greeting: "Hello, Ada" },
    });
  });

  it("answers the code-first query and mutation through the supergraph", async () => {
    expect(await post('{ tally(id: "q") { id count doubled } }')).toEqual({
      data: { tally: { id: "q", count: 0, doubled: 0 } },
    });
    expect(
      await post(
        'mutation { incrementTally(id: "q", by: 3) { id count doubled } }',
      ),
    ).toEqual({
      data: { incrementTally: { id: "q", count: 3, doubled: 6 } },
    });
    expect(await post('{ tally(id: "q") { id count doubled } }')).toEqual({
      data: { tally: { id: "q", count: 3, doubled: 6 } },
    });
  });
});

describe("subscriptions through the supergraph", () => {
  it("delivers the tally, its change and an r document creation over SSE", async () => {
    const id = "sub-SSE";
    const tally = overSse(
      `subscription { tallyChanged(id: "${id}") { id count doubled } }`,
    );
    const documents = overSse(DOCUMENT_CHANGES);
    await until(tally, 1);
    expect(
      await post(`mutation { incrementTally(id: "${id}", by: 2) { count } }`),
    ).toEqual({ data: { incrementTally: { count: 2 } } });
    await until(tally, 2);
    expect(tally).toEqual([
      { data: { tallyChanged: { id, count: 0, doubled: 0 } } },
      { data: { tallyChanged: { id, count: 2, doubled: 4 } } },
    ]);
    await expectDocumentCreation(documents, "SSE");
  }, 30_000);

  it("delivers an r document creation over WebSocket", async () => {
    await expectDocumentCreation(overWebSocket(DOCUMENT_CHANGES), "WebSocket");
  }, 30_000);
});
