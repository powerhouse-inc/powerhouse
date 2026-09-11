// The transport seam: PieceWorker drives a worker through five methods and
// knows nothing about processes.

// A fake standing in for the connection is the whole point — the same seam a
// pooled fork or a socket to another machine plugs into later.
import { PieceWorker } from "../../src/activepieces/worker/host.js";
import {
  type IPieceWorkerTransport,
  type TransportEvent,
  type TransportEventMap,
  type TransportListener,
} from "../../src/activepieces/worker/transport.js";

type Reply = (message: Record<string, unknown>) => void;

// A worker that never leaves this process: `respond` plays the part the child
// entry plays, and can answer, call back, exit or say nothing at all.
function fakeTransport(
  respond: (message: Record<string, unknown>, reply: Reply) => void,
): IPieceWorkerTransport & {
  sent: Record<string, unknown>[];
  emitExit: (code: number | null) => void;
} {
  const listeners = new Map<TransportEvent, Set<(payload: never) => void>>();
  const sent: Record<string, unknown>[] = [];
  let connected = true;

  const emit = <E extends TransportEvent>(
    event: E,
    payload: TransportEventMap[E],
  ) => {
    for (const listener of listeners.get(event) ?? []) {
      (listener as TransportListener<E>)(payload);
    }
  };

  return {
    sent,
    get connected() {
      return connected;
    },
    send(message) {
      const record = message as Record<string, unknown>;
      sent.push(record);
      if (!connected) return;
      respond(record, (reply) => emit("message", reply));
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (payload: never) => void);
      listeners.set(event, set);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener as (payload: never) => void);
    },
    kill() {
      connected = false;
      emit("exit", { code: null, signal: "SIGKILL" });
    },
    emitExit(code) {
      connected = false;
      emit("exit", { code, signal: null });
    },
  };
}

function runRequest() {
  return { bundleDir: "/nowhere", actionName: "noop", propsValue: {} };
}

describe("PieceWorker over a transport", () => {
  it("sends a request and resolves the matching reply", async () => {
    const transport = fakeTransport((message, reply) => {
      reply({
        id: message.id,
        type: "result",
        output: { ok: true },
        touched: [],
        tlsPoisoned: false,
      });
    });
    const worker = new PieceWorker({ transport: () => transport });

    const result = await worker.runAction(runRequest());

    expect(result.output).toEqual({ ok: true });
    expect(transport.sent[0]).toMatchObject({ id: 1, type: "run" });
  });

  it("serves a call the worker makes back mid-request", async () => {
    const transport = fakeTransport((message, reply) => {
      if (message.type === "run") {
        // The worker asks before it answers, exactly as a piece does.
        reply({ id: 1, type: "host-call", method: "store.get", payload: {} });
        return;
      }
      reply({
        id: message.id,
        type: "result",
        output: { seen: (message as { value?: unknown }).value },
        touched: [],
        tlsPoisoned: false,
      });
    });
    const worker = new PieceWorker({ transport: () => transport });

    // The reply to a host call is itself a send, which the fake feeds back in.
    const result = await worker.runAction(runRequest(), {
      hostCalls: { "store.get": () => Promise.resolve("from-host") },
    });

    expect(result.output).toEqual({ seen: "from-host" });
  });

  it("returns a refusal when no handler is registered for the method", async () => {
    const refusals: unknown[] = [];
    const transport = fakeTransport((message, reply) => {
      if (message.type === "run") {
        reply({ id: 1, type: "host-call", method: "store.put", payload: {} });
        return;
      }
      refusals.push(message.error);
      reply({
        id: 1,
        type: "result",
        output: null,
        touched: [],
        tlsPoisoned: false,
      });
    });
    const worker = new PieceWorker({ transport: () => transport });

    await worker.runAction(runRequest());

    expect(refusals).toEqual(['No host handler for "store.put"']);
  });

  it("rejects the in-flight request when the worker exits", async () => {
    // Dies while handling the request rather than answering it, which is what
    // an out-of-memory child does.
    const transport = fakeTransport(() => {
      queueMicrotask(() => transport.emitExit(1));
    });
    const worker = new PieceWorker({ transport: () => transport });

    await expect(worker.runAction(runRequest())).rejects.toThrow(/exited/i);
  });

  it("builds a fresh connection after one is killed", async () => {
    const built: IPieceWorkerTransport[] = [];
    const answer = (message: Record<string, unknown>, reply: Reply) =>
      reply({
        id: message.id,
        type: "result",
        output: null,
        touched: [],
        tlsPoisoned: false,
      });
    const worker = new PieceWorker({
      transport: () => {
        const transport = fakeTransport(answer);
        built.push(transport);
        return transport;
      },
    });

    await worker.runAction(runRequest());
    worker.dispose();
    await worker.runAction(runRequest());

    expect(built).toHaveLength(2);
  });
});
