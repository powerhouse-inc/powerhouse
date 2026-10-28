import { DriveCollectionId } from "@powerhousedao/reactor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTEMPT, RouteDispatcher } from "../src/dispatcher.js";
import { FakeBackend, fakeDocument, REMOTE, silent } from "./stubs.js";

const TTL = 30_000;

function pair(): {
  local: FakeBackend;
  remote: FakeBackend;
  dispatcher: RouteDispatcher;
} {
  const local = new FakeBackend("local");
  const remote = new FakeBackend("remote", undefined, REMOTE);
  const dispatcher = new RouteDispatcher([local.handle(), remote.handle()], {
    onDiagnostic: silent,
  });
  return { local, remote, dispatcher };
}

const read = (dispatcher: RouteDispatcher, identifier: string) =>
  dispatcher.onDocument(
    "get",
    identifier,
    (backend) => backend.api.get(identifier).then(() => backend.name),
    ATTEMPT.read,
  );

describe("provisional routes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves a route learned on a later backend to an earlier one after the TTL", async () => {
    const { local, remote, dispatcher } = pair();
    remote.seed(fakeDocument({ id: "doc" }));

    expect(await read(dispatcher, "doc")).toBe("remote");
    local.seed(fakeDocument({ id: "doc" }));
    const probes = local.count("isServed");

    vi.advanceTimersByTime(TTL - 1);
    expect(await read(dispatcher, "doc")).toBe("remote");
    expect(local.count("isServed")).toBe(probes);

    vi.advanceTimersByTime(1);
    expect(await read(dispatcher, "doc")).toBe("local");
    expect(dispatcher.table.documentBackend("doc")).toBe("local");
  });

  it("keeps the provisional mark through reads on the same backend", async () => {
    const { local, remote, dispatcher } = pair();
    remote.seed(fakeDocument({ id: "doc" }));

    await read(dispatcher, "doc");
    vi.advanceTimersByTime(TTL / 2);
    await read(dispatcher, "doc");
    local.seed(fakeDocument({ id: "doc" }));
    vi.advanceTimersByTime(TTL / 2);

    expect(await read(dispatcher, "doc")).toBe("local");
  });

  it("never expires a route on the first backend", async () => {
    const { local, remote, dispatcher } = pair();
    local.seed(fakeDocument({ id: "doc" }));

    await read(dispatcher, "doc");
    remote.seed(fakeDocument({ id: "doc" }));
    vi.advanceTimersByTime(TTL * 10);

    expect(dispatcher.table.documentBackend("doc")).toBe("local");
  });

  it("expires a provisional collection route", async () => {
    const { local, remote, dispatcher } = pair();
    remote.seed(fakeDocument({ id: "drive" }));
    const collection = DriveCollectionId.forDrive("drive");

    await dispatcher.resolveCollectionBackend(collection);
    expect(dispatcher.table.collectionRoute(collection)).toMatchObject({
      backend: "remote",
      source: "learned",
    });

    local.seed(fakeDocument({ id: "drive" }));
    vi.advanceTimersByTime(TTL);

    expect((await dispatcher.resolveCollectionBackend(collection)).name).toBe(
      "local",
    );
  });

  it("never expires a corrected route or a configured one", () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    const dispatcher = new RouteDispatcher([local.handle(), remote.handle()], {
      collections: { configured: "remote" },
      onDiagnostic: silent,
    });
    const corrected = DriveCollectionId.forDrive("corrected");
    dispatcher.table.recordCollection(corrected, "remote", "refusal");

    vi.advanceTimersByTime(TTL * 100);

    expect(dispatcher.table.collectionRoute(corrected)).toMatchObject({
      backend: "remote",
      source: "corrected",
    });
    expect(
      dispatcher.table.collectionRoute(
        DriveCollectionId.forDrive("configured"),
      ),
    ).toMatchObject({ backend: "remote", source: "override" });
  });

  it("honours provisionalRouteMs", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    const dispatcher = new RouteDispatcher([local.handle(), remote.handle()], {
      provisionalRouteMs: 1_000,
      onDiagnostic: silent,
    });
    remote.seed(fakeDocument({ id: "doc" }));

    await read(dispatcher, "doc");
    local.seed(fakeDocument({ id: "doc" }));
    vi.advanceTimersByTime(1_000);

    expect(await read(dispatcher, "doc")).toBe("local");
  });
});
