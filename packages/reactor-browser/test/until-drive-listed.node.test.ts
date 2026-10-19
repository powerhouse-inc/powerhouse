import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPHStore } from "../src/hooks/ph-store.js";
import { untilDriveListed } from "../src/routing/drive-arrivals.js";

const drive = (id: string) =>
  ({ header: { id, slug: id } }) as DocumentDriveDocument;

afterEach(() => {
  vi.useRealTimers();
});

describe("untilDriveListed", () => {
  it("resolves once the drives list the drive, and stops waiting", async () => {
    vi.useFakeTimers();
    const store = createPHStore({ drives: [] });
    let done = false;
    const listed = untilDriveListed(store, "remote").then(() => {
      done = true;
    });

    store.drives = [drive("other")];
    await Promise.resolve();
    expect(done).toBe(false);

    store.drives = [drive("other"), drive("remote")];
    await listed;
    expect(done).toBe(true);
    // The cap's timer is cleared with the subscription.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves at once for a listed drive and at the cap otherwise", async () => {
    vi.useFakeTimers();
    const store = createPHStore({ drives: [drive("remote")] });
    await untilDriveListed(store, "remote");

    let done = false;
    const capped = untilDriveListed(store, "missing", 1_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await capped;
    expect(done).toBe(true);
  });
});
