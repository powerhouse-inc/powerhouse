import type { PagingOptions } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  RouterBackend,
  UnsupportedByBackendError,
  type IRoutableBackend,
} from "../src/backend.js";
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
  supportingBackends,
} from "../src/fan-in.js";
import {
  FakeBackend,
  fakeDocument,
  IN_PROCESS,
  memoryInfo,
  silent,
} from "./stubs.js";

const STRICT = { mode: "strict", onDiagnostic: silent } as const;
const TOLERANT = { mode: "tolerant", onDiagnostic: silent } as const;

function pool(...names: string[]): RouterBackend[] {
  return names.map((name) => new FakeBackend(name).handle());
}

function find(backend: RouterBackend, paging: PagingOptions | undefined) {
  return backend.api.find({ type: "test/doc" }, undefined, paging);
}

const byId = (document: PHDocument): string => document.header.id;

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
        STRICT,
      ),
    ).toThrow(InvalidFanInCursorError);
  });

  it("passes a foreign cursor straight through to a lone backend", () => {
    const participants = pagedParticipants(
      "find",
      pool("only"),
      { cursor: "42", limit: 10 },
      STRICT,
    );

    expect(participants).toHaveLength(1);
    expect(participants[0].backend.name).toBe("only");
    expect(participants[0].cursor).toBe("42");
  });

  it("continues only the backends a router cursor names", () => {
    const cursor = encodeFanInCursor([{ backend: "three", cursor: "9" }]);

    const participants = pagedParticipants(
      "find",
      pool("one", "two", "three"),
      { cursor, limit: 5 },
      STRICT,
    );

    expect(participants.map((entry) => entry.backend.name)).toEqual(["three"]);
    expect(participants[0].cursor).toBe("9");
  });

  it("surfaces a continuation cursor naming an absent backend under strict mode", () => {
    const cursor = encodeFanInCursor([
      { backend: "gone", cursor: "9" },
      { backend: "two", cursor: "3" },
    ]);

    expect(() =>
      pagedParticipants(
        "find",
        pool("one", "two"),
        { cursor, limit: 5 },
        STRICT,
      ),
    ).toThrow(FanInPartialFailureError);
  });

  it("drops an absent backend and reports it under tolerant mode", () => {
    const cursor = encodeFanInCursor([
      { backend: "gone", cursor: "9" },
      { backend: "two", cursor: "3" },
    ]);
    const reported: string[] = [];

    const participants = pagedParticipants(
      "find",
      pool("one", "two"),
      { cursor, limit: 5 },
      { mode: "tolerant", onDiagnostic: (message) => reported.push(message) },
    );

    expect(participants.map((entry) => entry.backend.name)).toEqual(["two"]);
    expect(reported.join()).toMatch(/gone.*no longer configured/);
  });
});

describe("fanIn", () => {
  it("raises a strict failure carrying what did answer", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    two.failing.add("isServed");

    const run = fanIn(
      "isServed",
      [one.handle(), two.handle()],
      (backend) => backend.api.isServed("doc-1"),
      STRICT,
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
  });

  it("tolerates a failing backend and reports it", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const two = new FakeBackend("two");
    two.failing.add("isServed");
    const reported: string[] = [];

    const answers = await fanIn(
      "isServed",
      [one.handle(), two.handle()],
      (backend) => backend.api.isServed("doc-1"),
      { mode: "tolerant", onDiagnostic: (message) => reported.push(message) },
    );

    expect(answers.map((answer) => answer.value)).toEqual([true]);
    expect(reported.join()).toMatch(/backend two contributed nothing/);
  });

  it("treats a SYNCHRONOUS throw as that backend's failure", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const throwing = new RouterBackend({
      name: "throws",
      backend: {
        isServed: () => {
          throw new Error("this proxy does not serve isServed");
        },
      } as unknown as IRoutableBackend,
      facts: memoryInfo(),
      reach: IN_PROCESS,
      refusesMisroutes: false,
    });

    const answers = await fanIn(
      "isServed",
      [one.handle(), throwing],
      (backend) => backend.api.isServed("doc-1"),
      TOLERANT,
    );

    expect(answers.map((answer) => answer.value)).toEqual([true]);
  });

  it("raises the first failure when every backend fails", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.failing.add("isServed");
    two.failing.add("isServed");

    const run = fanIn(
      "isServed",
      [one.handle(), two.handle()],
      (backend) => backend.api.isServed("doc-1"),
      TOLERANT,
    );

    await expect(run).rejects.toThrow(/one: isServed is configured to fail/);
  });
});

describe("fanInExistence", () => {
  it("returns true when any backend answers true, logging one that could not", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const two = new FakeBackend("two");
    two.failing.add("isServed");
    const reported: string[] = [];

    const answer = await fanInExistence(
      "isServed",
      [one.handle(), two.handle()],
      (backend) => backend.api.isServed("doc-1"),
      (message) => reported.push(message),
    );

    expect(answer).toBe(true);
    expect(reported.join()).toMatch(/backend two could not answer/);
  });

  it("returns false only when every backend actually answered false", async () => {
    const answer = await fanInExistence(
      "isServed",
      pool("one", "two"),
      (backend) => backend.api.isServed("nowhere"),
      silent,
    );

    expect(answer).toBe(false);
  });

  it("fails loud instead of returning false when a backend errored", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    two.failing.add("isServed");

    const run = fanInExistence(
      "isServed",
      [one.handle(), two.handle()],
      (backend) => backend.api.isServed("doc-1"),
      silent,
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
  });

  it("fails loud instead of returning false when a backend could not be asked", async () => {
    const run = fanInExistence(
      "isServed",
      pool("one"),
      (backend) => backend.api.isServed("doc-1"),
      silent,
      [
        {
          backend: "two",
          error: new UnsupportedByBackendError("two", "isServed", "no"),
        },
      ],
    );

    await expect(run).rejects.toThrow(FanInPartialFailureError);
  });
});

describe("supportingBackends", () => {
  it("excludes a backend that declares no support and reports it", () => {
    const reported: string[] = [];

    const supporting = supportingBackends(
      "find",
      pool("one", "two"),
      (backend) => (backend.name === "two" ? "find is not served" : ""),
      (message) => reported.push(message),
    );

    expect(supporting.map((backend) => backend.name)).toEqual(["one"]);
    expect(reported.join()).toMatch(/find: backend two was excluded/);
  });

  it("refuses the read when no backend supports it", () => {
    expect(() =>
      supportingBackends("find", pool("one", "two"), () => "no", silent),
    ).toThrow(UnsupportedByBackendError);
  });
});

describe("mergePaged", () => {
  it("concatenates in backend order and de-duplicates by identity", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    const shared = fakeDocument({ id: "shared", documentType: "test/doc" });
    one.seed(fakeDocument({ id: "only-on-one", documentType: "test/doc" }));
    one.seed(shared);
    two.seed(shared);
    two.seed(fakeDocument({ id: "only-on-two", documentType: "test/doc" }));

    const page = await mergePaged(
      pagedParticipants(
        "find",
        [one.handle(), two.handle()],
        undefined,
        STRICT,
      ),
      find,
      { ...STRICT, operation: "find", identify: byId, paging: undefined },
    );

    expect(page.results.map(byId)).toEqual([
      "only-on-one",
      "shared",
      "only-on-two",
    ]);
  });

  it("carries one cursor per backend and continues only those", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    for (let i = 0; i < 3; i++) {
      one.seed(fakeDocument({ id: `one-${i}`, documentType: "test/doc" }));
    }
    two.seed(fakeDocument({ id: "two-0", documentType: "test/doc" }));
    const paging = { cursor: "", limit: 2 };

    const first = await mergePaged(
      pagedParticipants("find", [one.handle(), two.handle()], paging, STRICT),
      find,
      { ...STRICT, operation: "find", identify: byId, paging },
    );

    expect(first.results.map(byId)).toEqual(["one-0", "one-1", "two-0"]);
    expect(decodeFanInCursor(first.nextCursor ?? "")).toEqual([
      { backend: "one", cursor: "2" },
    ]);

    const second = await first.next?.();

    expect(second?.results.map(byId)).toEqual(["one-2"]);
    expect(second?.nextCursor).toBeUndefined();
  });

  it("keeps each backend's default page size across continuations when no limit was set", async () => {
    const DEFAULT_PAGE_SIZE = 2;
    const ids = ["a", "b", "c", "d", "e"];
    const requestedLimits: number[] = [];
    const big = new RouterBackend({
      name: "big",
      backend: {
        find: (_search: unknown, _view: unknown, paging?: PagingOptions) => {
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
      } as unknown as IRoutableBackend,
      facts: memoryInfo(),
      reach: IN_PROCESS,
      refusesMisroutes: false,
    });

    const first = await mergePaged(
      pagedParticipants("find", [big], undefined, STRICT),
      find,
      { ...STRICT, operation: "find", identify: byId, paging: undefined },
    );
    const second = await first.next?.();
    const third = await second?.next?.();

    expect(first.results).toHaveLength(2);
    expect(second?.results).toHaveLength(2);
    expect(third?.results).toHaveLength(1);
    expect(third?.nextCursor).toBeUndefined();
    expect(requestedLimits.every((limit) => limit <= DEFAULT_PAGE_SIZE)).toBe(
      true,
    );
  });
});
