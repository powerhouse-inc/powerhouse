import { describe, expect, it } from "vitest";
import {
  FanInPartialFailureError,
  InvalidFanInCursorError,
} from "../src/errors.js";
import {
  decodeFanInCursor,
  encodeFanInCursor,
  fanIn,
  isFanInCursor,
  mergePaged,
  pagedParticipants,
} from "../src/fan-in.js";
import type { ReactorBackend } from "../src/types.js";
import { FakeReactor, fakeDocument, inProcessCapabilities } from "./stubs.js";

const silent = (): void => {};

function pool(...names: string[]): ReactorBackend[] {
  return names.map((name) =>
    new FakeReactor(name, inProcessCapabilities(name)).backend(),
  );
}

describe("fan-in cursors", () => {
  it("round-trips one cursor per backend", () => {
    const cursor = encodeFanInCursor([
      { backend: "one", cursor: "7" },
      { backend: "two", cursor: "abc" },
    ]);

    expect(isFanInCursor(cursor)).toBe(true);
    expect(decodeFanInCursor(cursor)).toEqual([
      { backend: "one", cursor: "7" },
      { backend: "two", cursor: "abc" },
    ]);
  });

  it("refuses a malformed cursor by name", () => {
    expect(() => decodeFanInCursor("7")).toThrow(InvalidFanInCursorError);
    expect(() => decodeFanInCursor("router:v1:{}")).toThrow(
      /body is not an array/,
    );
    expect(() => decodeFanInCursor('router:v1:[{"backend":1}]')).toThrow(
      /missing a string backend or cursor/,
    );
  });

  it("refuses a foreign cursor when several backends would have to share it", () => {
    expect(() =>
      pagedParticipants("find", pool("one", "two"), {
        cursor: "42",
        limit: 10,
      }),
    ).toThrow(InvalidFanInCursorError);
  });

  it("passes a foreign cursor straight through to a lone backend", () => {
    const participants = pagedParticipants("find", pool("only"), {
      cursor: "42",
      limit: 10,
    });

    expect(participants).toHaveLength(1);
    expect(participants[0]?.backend.name).toBe("only");
    expect(participants[0]?.cursor).toBe("42");
  });

  it("continues only the backends a router cursor names", () => {
    const backends = pool("one", "two", "three");
    const cursor = encodeFanInCursor([{ backend: "three", cursor: "9" }]);

    const participants = pagedParticipants("find", backends, {
      cursor,
      limit: 5,
    });

    expect(participants.map((entry) => entry.backend.name)).toEqual(["three"]);
    expect(participants[0]?.cursor).toBe("9");
  });
});

describe("fanIn", () => {
  it("raises a strict failure carrying what did answer", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    two.failing.add("isServed");
    const backends = [one.backend(), two.backend()];

    const run = fanIn(
      "isServed",
      backends,
      (backend) => backend.client.isServed("doc-1"),
      { mode: "strict", onDiagnostic: silent },
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
  });

  it("tolerates a failing backend and reports it", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "doc-1" }));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    two.failing.add("isServed");
    const reported: string[] = [];

    const answers = await fanIn(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      {
        mode: "tolerant",
        onDiagnostic: (message) => reported.push(message),
      },
    );

    expect(answers.map((answer) => answer.value)).toEqual([true]);
    expect(reported.join()).toMatch(/backend two contributed nothing/);
  });

  it("treats a SYNCHRONOUS throw as that backend's failure", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "doc-1" }));
    const throwing: ReactorBackend = {
      name: "throws",
      capabilities: inProcessCapabilities("throws"),
      // The shape reactor-browser's RPC proxies have for a surface they do not
      // serve: a synchronous throw, not a rejected promise.
      client: {
        isServed: () => {
          throw new Error("this proxy does not serve isServed");
        },
      } as unknown as ReactorBackend["client"],
    };

    const answers = await fanIn(
      "isServed",
      [one.backend(), throwing],
      (backend) => backend.client.isServed("doc-1"),
      { mode: "tolerant", onDiagnostic: silent },
    );

    expect(answers.map((answer) => answer.value)).toEqual([true]);
  });

  it("raises the first failure when every backend fails", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    one.failing.add("isServed");
    two.failing.add("isServed");

    const run = fanIn(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      { mode: "tolerant", onDiagnostic: silent },
    );

    await expect(run).rejects.toThrow(/one: isServed is configured to fail/);
  });
});

describe("mergePaged", () => {
  it("concatenates in backend order and de-duplicates by identity", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    const shared = fakeDocument({ id: "shared", documentType: "test/doc" });
    one.seed(fakeDocument({ id: "only-on-one", documentType: "test/doc" }));
    one.seed(shared);
    two.seed(shared);
    two.seed(fakeDocument({ id: "only-on-two", documentType: "test/doc" }));

    const page = await mergePaged(
      pagedParticipants("find", [one.backend(), two.backend()], undefined),
      (backend, paging) =>
        backend.client.find({ type: "test/doc" }, undefined, paging),
      {
        operation: "find",
        mode: "strict",
        onDiagnostic: silent,
        identify: (document) => document.header.id,
        paging: undefined,
      },
    );

    expect(page.results.map((document) => document.header.id)).toEqual([
      "only-on-one",
      "shared",
      "only-on-two",
    ]);
  });

  it("carries one cursor per backend and continues only those", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    for (let i = 0; i < 3; i++) {
      one.seed(fakeDocument({ id: `one-${i}`, documentType: "test/doc" }));
    }
    two.seed(fakeDocument({ id: "two-0", documentType: "test/doc" }));
    const backends = [one.backend(), two.backend()];
    const call = (
      backend: ReactorBackend,
      paging: { cursor: string; limit: number } | undefined,
    ) => backend.client.find({ type: "test/doc" }, undefined, paging);
    const options = {
      operation: "find" as const,
      mode: "strict" as const,
      onDiagnostic: silent,
      identify: (document: { header: { id: string } }) => document.header.id,
      paging: { cursor: "", limit: 2 },
    };

    const first = await mergePaged(
      pagedParticipants("find", backends, options.paging),
      call,
      options,
    );

    // limit is PER BACKEND: two from "one", one from "two".
    expect(first.results.map((document) => document.header.id)).toEqual([
      "one-0",
      "one-1",
      "two-0",
    ]);
    expect(decodeFanInCursor(first.nextCursor ?? "")).toEqual([
      { backend: "one", cursor: "2" },
    ]);

    const second = await first.next?.();

    expect(second?.results.map((document) => document.header.id)).toEqual([
      "one-2",
    ]);
    expect(second?.nextCursor).toBeUndefined();
  });
});
