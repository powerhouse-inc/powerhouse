import { describe, expect, it } from "vitest";
import {
  FanInPartialFailureError,
  InvalidFanInCursorError,
} from "../src/errors.js";
import {
  decodeFanInCursor,
  encodeFanInCursor,
  fanIn,
  fanInExistence,
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
      pagedParticipants(
        "find",
        pool("one", "two"),
        { cursor: "42", limit: 10 },
        { mode: "strict", onDiagnostic: silent, tolerateNotSupported: true },
      ),
    ).toThrow(InvalidFanInCursorError);
  });

  it("passes a foreign cursor straight through to a lone backend", () => {
    const participants = pagedParticipants(
      "find",
      pool("only"),
      { cursor: "42", limit: 10 },
      { mode: "strict", onDiagnostic: silent, tolerateNotSupported: true },
    );

    expect(participants).toHaveLength(1);
    expect(participants[0]?.backend.name).toBe("only");
    expect(participants[0]?.cursor).toBe("42");
  });

  it("continues only the backends a router cursor names", () => {
    const backends = pool("one", "two", "three");
    const cursor = encodeFanInCursor([{ backend: "three", cursor: "9" }]);

    const participants = pagedParticipants(
      "find",
      backends,
      { cursor, limit: 5 },
      { mode: "strict", onDiagnostic: silent, tolerateNotSupported: true },
    );

    expect(participants.map((entry) => entry.backend.name)).toEqual(["three"]);
    expect(participants[0]?.cursor).toBe("9");
  });

  it("surfaces a continuation cursor naming an absent backend under strict mode", () => {
    const backends = pool("one", "two");
    const cursor = encodeFanInCursor([
      { backend: "gone", cursor: "9" },
      { backend: "two", cursor: "3" },
    ]);

    expect(() =>
      pagedParticipants(
        "find",
        backends,
        { cursor, limit: 5 },
        { mode: "strict", onDiagnostic: silent, tolerateNotSupported: true },
      ),
    ).toThrow(FanInPartialFailureError);
  });

  it("drops an absent backend and reports it under tolerant mode", () => {
    const backends = pool("one", "two");
    const cursor = encodeFanInCursor([
      { backend: "gone", cursor: "9" },
      { backend: "two", cursor: "3" },
    ]);
    const reported: string[] = [];

    const participants = pagedParticipants(
      "find",
      backends,
      { cursor, limit: 5 },
      {
        mode: "tolerant",
        onDiagnostic: (message) => reported.push(message),
        tolerateNotSupported: true,
      },
    );

    expect(participants.map((entry) => entry.backend.name)).toEqual(["two"]);
    expect(reported.join()).toMatch(/gone.*no longer configured/);
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
      { mode: "strict", onDiagnostic: silent, tolerateNotSupported: false },
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
        tolerateNotSupported: false,
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
      { mode: "tolerant", onDiagnostic: silent, tolerateNotSupported: false },
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
      { mode: "tolerant", onDiagnostic: silent, tolerateNotSupported: false },
    );

    await expect(run).rejects.toThrow(/one: isServed is configured to fail/);
  });

  it("excludes a not-applicable backend only when the read opts to tolerate it, even under strict mode", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "doc-1" }));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    // The remote-backend shape: a client that cannot serve this read by
    // contract, not a reactor that failed at runtime.
    two.unsupported.add("isServed");
    const reported: string[] = [];

    const answers = await fanIn(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      {
        mode: "strict",
        onDiagnostic: (message) => reported.push(message),
        tolerateNotSupported: true,
      },
    );

    // Strict did NOT raise: a by-contract limitation the read tolerates is not
    // incompleteness.
    expect(answers.map((answer) => answer.value)).toEqual([true]);
    expect(reported.join()).toMatch(
      /backend two is not applicable to this read and was excluded/,
    );
  });

  it("fails loud on a not-supported backend the read did NOT opt to tolerate, even when another backend answered", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "doc-1" }));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    two.unsupported.add("isServed");

    const run = fanIn(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      { mode: "tolerant", onDiagnostic: silent, tolerateNotSupported: false },
    );

    // one answered, but tolerateNotSupported is false: the excluded backend
    // might have held the only trustworthy answer, so no mode may mask it.
    await expect(run).rejects.toThrow(FanInPartialFailureError);
    await run.catch((error: unknown) => {
      const partial = error as FanInPartialFailureError;
      expect(partial.failures.map((failure) => failure.backend)).toEqual([
        "two",
      ]);
    });
  });

  it("still raises FanInPartialFailureError when a CAPABLE backend errors, naming only the genuine failure and carrying the excluded one", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "doc-1" }));
    const capable = new FakeReactor(
      "capable",
      inProcessCapabilities("capable"),
    );
    capable.failing.add("isServed");
    const limited = new FakeReactor(
      "limited",
      inProcessCapabilities("limited"),
    );
    limited.unsupported.add("isServed");

    const run = fanIn(
      "isServed",
      [one.backend(), capable.backend(), limited.backend()],
      (backend) => backend.client.isServed("doc-1"),
      { mode: "strict", onDiagnostic: silent, tolerateNotSupported: true },
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
    await run.catch((error: unknown) => {
      const partial = error as FanInPartialFailureError;
      expect(partial.failures.map((failure) => failure.backend)).toEqual([
        "capable",
      ]);
      // The excluded backend is carried for observability, not counted as a
      // failure (defect #6).
      expect(partial.excluded.map((entry) => entry.backend)).toEqual([
        "limited",
      ]);
    });
  });

  it("raises a hard error when every backend is not applicable, even for a read that tolerates exclusions (all-excluded)", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    one.unsupported.add("isServed");
    two.unsupported.add("isServed");
    const reported: string[] = [];

    const run = fanIn(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      {
        mode: "strict",
        onDiagnostic: (message) => reported.push(message),
        tolerateNotSupported: true,
      },
    );

    // Zero backends answered: there is no union to return, so an all-excluded
    // read is a hard error (defect #2), never an empty page.
    await expect(run).rejects.toThrow(FanInPartialFailureError);
    await run.catch((error: unknown) => {
      const partial = error as FanInPartialFailureError;
      expect(partial.failures).toEqual([]);
      expect(partial.excluded.map((entry) => entry.backend)).toEqual([
        "one",
        "two",
      ]);
    });
    // The exclusions are still logged, both modes.
    expect(
      reported.filter((message) => message.includes("not applicable")),
    ).toHaveLength(2);
  });
});

describe("fanInExistence", () => {
  it("returns true when any backend answers true, logging one that could not", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "doc-1" }));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    two.unsupported.add("isServed");
    const reported: string[] = [];

    const answer = await fanInExistence(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      (message) => reported.push(message),
    );

    // A true settles it; the non-answering backend cannot change that.
    expect(answer).toBe(true);
    expect(reported.join()).toMatch(/backend two could not answer/);
  });

  it("returns false only when every backend actually answered false", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));

    const answer = await fanInExistence(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("nowhere"),
      silent,
    );

    expect(answer).toBe(false);
  });

  it("fails loud instead of returning false when a backend could not answer by contract", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    // one does not serve it, two cannot answer at all: reporting false here
    // would be a confidently-wrong negative when two might serve it.
    two.unsupported.add("isServed");

    const run = fanInExistence(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      silent,
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
  });

  it("fails loud instead of returning false when a backend errored at runtime", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    two.failing.add("isServed");

    const run = fanInExistence(
      "isServed",
      [one.backend(), two.backend()],
      (backend) => backend.client.isServed("doc-1"),
      silent,
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
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
      pagedParticipants("find", [one.backend(), two.backend()], undefined, {
        mode: "strict",
        onDiagnostic: silent,
        tolerateNotSupported: true,
      }),
      (backend, paging) =>
        backend.client.find({ type: "test/doc" }, undefined, paging),
      {
        operation: "find",
        mode: "strict",
        tolerateNotSupported: true,
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

  it("excludes a backend that cannot serve find by contract and merges only the capable backends", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    one.seed(fakeDocument({ id: "only-on-one", documentType: "test/doc" }));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    // The exact Connect boot scenario: the remote backend cannot serve find.
    two.unsupported.add("find");
    const reported: string[] = [];

    const page = await mergePaged(
      pagedParticipants("find", [one.backend(), two.backend()], undefined, {
        mode: "strict",
        onDiagnostic: (message) => reported.push(message),
        tolerateNotSupported: true,
      }),
      (backend, paging) =>
        backend.client.find({ type: "test/doc" }, undefined, paging),
      {
        operation: "find",
        mode: "strict",
        tolerateNotSupported: true,
        onDiagnostic: (message) => reported.push(message),
        identify: (document) => document.header.id,
        paging: undefined,
      },
    );

    // The capable backend's rows, not a thrown FanInPartialFailureError.
    expect(page.results.map((document) => document.header.id)).toEqual([
      "only-on-one",
    ]);
    expect(reported.join()).toMatch(
      /find: backend two is not applicable to this read and was excluded/,
    );
  });

  it("raises a hard error when every backend cannot serve find (all-excluded)", async () => {
    const one = new FakeReactor("one", inProcessCapabilities("one"));
    const two = new FakeReactor("two", inProcessCapabilities("two"));
    one.unsupported.add("find");
    two.unsupported.add("find");

    const run = mergePaged(
      pagedParticipants("find", [one.backend(), two.backend()], undefined, {
        mode: "strict",
        onDiagnostic: silent,
        tolerateNotSupported: true,
      }),
      (backend, paging) =>
        backend.client.find({ type: "test/doc" }, undefined, paging),
      {
        operation: "find",
        mode: "strict",
        tolerateNotSupported: true,
        onDiagnostic: silent,
        identify: (document) => document.header.id,
        paging: undefined,
      },
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
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
      tolerateNotSupported: true,
      onDiagnostic: silent,
      identify: (document: { header: { id: string } }) => document.header.id,
      paging: { cursor: "", limit: 2 },
    };

    const first = await mergePaged(
      pagedParticipants("find", backends, options.paging, {
        mode: options.mode,
        onDiagnostic: options.onDiagnostic,
        tolerateNotSupported: true,
      }),
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

  it("keeps requesting the backend's default page size across continuations when the caller set no limit", async () => {
    const DEFAULT_PAGE_SIZE = 2;
    const ids = ["a", "b", "c", "d", "e"];
    const requestedLimits: number[] = [];
    const backend: ReactorBackend = {
      name: "big",
      capabilities: inProcessCapabilities("big"),
      client: {
        find: (
          _search: unknown,
          _view: unknown,
          paging?: { cursor: string; limit: number },
        ) => {
          // Mirrors the real reactor's own `paging?.limit || DEFAULT` idiom:
          // a falsy limit (undefined, or the fan-in's 0 sentinel) means "use my
          // own default", never "give me everything".
          const limit = paging?.limit || DEFAULT_PAGE_SIZE;
          requestedLimits.push(limit);
          const offset = paging?.cursor ? Number(paging.cursor) : 0;
          const slice = ids
            .slice(offset, offset + limit)
            .map((id) => fakeDocument({ id, documentType: "test/doc" }));
          const next = offset + slice.length;
          return Promise.resolve({
            results: slice,
            options: { cursor: paging?.cursor ?? "", limit },
            nextCursor: next < ids.length ? String(next) : undefined,
          });
        },
      } as unknown as ReactorBackend["client"],
    };
    const call = (
      b: ReactorBackend,
      paging: { cursor: string; limit: number } | undefined,
    ) => b.client.find({ type: "test/doc" }, undefined, paging);

    const first = await mergePaged(
      pagedParticipants("find", [backend], undefined, {
        mode: "strict",
        onDiagnostic: silent,
        tolerateNotSupported: true,
      }),
      call,
      {
        operation: "find",
        mode: "strict",
        tolerateNotSupported: true,
        onDiagnostic: silent,
        identify: (document: { header: { id: string } }) => document.header.id,
        paging: undefined,
      },
    );
    const second = await first.next?.();
    const third = await second?.next?.();

    expect(first.results).toHaveLength(2);
    expect(second?.results).toHaveLength(2);
    expect(third?.results).toHaveLength(1);
    expect(third?.nextCursor).toBeUndefined();
    // Never inflated to Number.MAX_SAFE_INTEGER: every request, including the
    // continuations, asked for no more than the backend's own default page.
    expect(requestedLimits.every((limit) => limit <= DEFAULT_PAGE_SIZE)).toBe(
      true,
    );
  });
});
