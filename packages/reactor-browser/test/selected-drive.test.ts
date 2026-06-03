import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { addDrivesEventHandler, setDrives } from "../src/hooks/drives.js";
import {
  addSelectedDriveIdEventHandler,
  setSelectedDrive,
} from "../src/hooks/selected-drive.js";
import { addSelectedNodeIdEventHandler } from "../src/hooks/selected-node.js";

function makeDrive(slug: string, id: string): DocumentDriveDocument {
  return {
    header: { id, slug },
  } as DocumentDriveDocument;
}

const DEEP_LINK = "/d/preview-5d7ab3ec/some-doc-123";
const ROOT = "/";

describe("setSelectedDrive deep-link race", () => {
  // Register window handlers once; re-registering per test accumulates
  // listeners (addEventListener dedupes identical refs, but keep it explicit).
  beforeAll(() => {
    addDrivesEventHandler();
    addSelectedDriveIdEventHandler();
    addSelectedNodeIdEventHandler();
  });

  beforeEach(() => {
    window.ph = {};
    window.history.replaceState(null, "", DEEP_LINK);
  });

  afterEach(() => {
    // Cancels any deferred lookup left by the test.
    setSelectedDrive(undefined);
    window.ph = {};
    window.history.replaceState(null, "", ROOT);
  });

  it("preserves the deep link when drives have not loaded yet", () => {
    // drives undefined: not loaded
    setSelectedDrive("preview-5d7ab3ec");
    expect(window.location.pathname).toBe(DEEP_LINK);
    expect(window.ph?.selectedDriveId).toBeUndefined();
  });

  it("selects the drive once it arrives after a deferred lookup", () => {
    setSelectedDrive("preview-5d7ab3ec");
    expect(window.location.pathname).toBe(DEEP_LINK);

    // drive finishes syncing and populates the collection
    setDrives([makeDrive("preview-5d7ab3ec", "drive-id-1")]);

    expect(window.ph?.selectedDriveId).toBe("drive-id-1");
    // node segment from the deep link is preserved
    expect(window.location.pathname).toBe(DEEP_LINK);
  });

  it("redirects to root for a genuinely unknown drive after the grace period", () => {
    vi.useFakeTimers();
    try {
      // drives loaded but the slug is absent — still gets the grace period,
      // since drives register one by one and more may arrive
      setDrives([makeDrive("other-drive", "drive-id-2")]);
      setSelectedDrive("preview-5d7ab3ec");
      expect(window.location.pathname).toBe(DEEP_LINK);

      vi.advanceTimersByTime(10_000);

      expect(window.ph?.selectedDriveId).toBeUndefined();
      expect(window.location.pathname).toBe(ROOT);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps waiting while other drives arrive, then selects the pinned drive", () => {
    setSelectedDrive("preview-5d7ab3ec");
    expect(window.location.pathname).toBe(DEEP_LINK);

    // default drives register one by one; another drive lands first
    setDrives([makeDrive("other-drive", "drive-id-3")]);
    expect(window.ph?.selectedDriveId).toBeUndefined();
    expect(window.location.pathname).toBe(DEEP_LINK);

    // the pinned drive arrives in a later update
    setDrives([
      makeDrive("other-drive", "drive-id-3"),
      makeDrive("preview-5d7ab3ec", "drive-id-6"),
    ]);
    expect(window.ph?.selectedDriveId).toBe("drive-id-6");
    // node segment from the deep link is preserved
    expect(window.location.pathname).toBe(DEEP_LINK);
  });

  it("redirects to root when the slug never resolves within the grace period", () => {
    vi.useFakeTimers();
    try {
      setSelectedDrive("preview-5d7ab3ec");
      setDrives([makeDrive("other-drive", "drive-id-3")]);
      expect(window.location.pathname).toBe(DEEP_LINK);

      vi.advanceTimersByTime(10_000);

      expect(window.ph?.selectedDriveId).toBeUndefined();
      expect(window.location.pathname).toBe(ROOT);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not resurrect a deep link after an explicit home selection", () => {
    // deep link defers because drives have not loaded
    setSelectedDrive("preview-5d7ab3ec");
    expect(window.location.pathname).toBe(DEEP_LINK);

    // user explicitly navigates home before drives arrive
    setSelectedDrive(undefined);
    expect(window.location.pathname).toBe(ROOT);

    // the pinned drive later syncs; selection must stay at home
    setDrives([makeDrive("preview-5d7ab3ec", "drive-id-5")]);
    expect(window.ph?.selectedDriveId).toBeUndefined();
    expect(window.location.pathname).toBe(ROOT);
  });

  it("restores both drive and node from a deep link after a late drive arrival", () => {
    const nodeId = "11111111-2222-3333-4444-555555555555";
    const nodeSlug = `some-doc-${nodeId}`;
    const docDeepLink = `/d/preview-5d7ab3ec/${nodeSlug}`;
    window.history.replaceState(null, "", docDeepLink);

    // drives not loaded yet: deep link (drive + node) must be preserved
    setSelectedDrive("preview-5d7ab3ec");
    expect(window.location.pathname).toBe(docDeepLink);

    // unrelated drive arrives first; pinned drive still missing
    setDrives([makeDrive("other-drive", "drive-id-a")]);
    expect(window.ph?.selectedDriveId).toBeUndefined();
    expect(window.location.pathname).toBe(docDeepLink);

    // pinned drive arrives in a later update
    setDrives([
      makeDrive("other-drive", "drive-id-a"),
      makeDrive("preview-5d7ab3ec", "drive-id-b"),
    ]);

    expect(window.ph?.selectedDriveId).toBe("drive-id-b");
    expect(window.ph?.selectedNodeId).toBe(nodeId);
    expect(window.location.pathname).toBe(docDeepLink);
  });

  it("keeps deferring past the tick while an initial sync is in flight", () => {
    vi.useFakeTimers();
    try {
      // a sync remote that has not completed its first pull
      window.ph!.reactorClientModule = {
        reactorModule: {
          syncModule: {
            syncManager: {
              list: () => [
                {
                  channel: {
                    getConnectionState: () => ({
                      state: "connecting",
                      receivingPages: true,
                      lastSuccessUtcMs: 0,
                    }),
                  },
                },
              ],
            },
          },
        },
      } as unknown as NonNullable<typeof window.ph>["reactorClientModule"];

      setSelectedDrive("preview-5d7ab3ec");
      expect(window.location.pathname).toBe(DEEP_LINK);

      // several ticks pass; the in-flight sync keeps the deferral alive
      vi.advanceTimersByTime(10_000);
      expect(window.location.pathname).toBe(DEEP_LINK);

      // the drive finally lands and resolves the deferred selection
      setDrives([makeDrive("preview-5d7ab3ec", "drive-id-11")]);
      expect(window.ph?.selectedDriveId).toBe("drive-id-11");
      expect(window.location.pathname).toBe(DEEP_LINK);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up at the hard cap even if a sync never settles", () => {
    vi.useFakeTimers();
    try {
      window.ph!.reactorClientModule = {
        reactorModule: {
          syncModule: {
            syncManager: {
              list: () => [
                {
                  channel: {
                    getConnectionState: () => ({
                      state: "connecting",
                      receivingPages: true,
                      lastSuccessUtcMs: 0,
                    }),
                  },
                },
              ],
            },
          },
        },
      } as unknown as NonNullable<typeof window.ph>["reactorClientModule"];

      setSelectedDrive("preview-5d7ab3ec");
      vi.advanceTimersByTime(20_000);

      expect(window.ph?.selectedDriveId).toBeUndefined();
      expect(window.location.pathname).toBe(ROOT);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a stale selection while a deferred deep link resolves", () => {
    // user is on another drive, then navigates to a deep link whose drive
    // has not registered yet
    setDrives([makeDrive("other-drive", "drive-id-9")]);
    window.history.replaceState(null, "", "/d/other-drive");
    setSelectedDrive("other-drive");
    expect(window.ph?.selectedDriveId).toBe("drive-id-9");

    window.history.replaceState(null, "", DEEP_LINK);
    setSelectedDrive("preview-5d7ab3ec");

    // the previous drive must not keep rendering against the new URL
    expect(window.ph?.selectedDriveId).toBeUndefined();
    expect(window.location.pathname).toBe(DEEP_LINK);

    // the pinned drive arrives and resolves the deferred selection
    setDrives([
      makeDrive("other-drive", "drive-id-9"),
      makeDrive("preview-5d7ab3ec", "drive-id-10"),
    ]);
    expect(window.ph?.selectedDriveId).toBe("drive-id-10");
    expect(window.location.pathname).toBe(DEEP_LINK);
  });

  it("does not defer a selection that is not pinned in the URL", () => {
    // e.g. selecting a drive that has not registered yet while at home —
    // falls through immediately instead of deferring
    window.history.replaceState(null, "", ROOT);
    setSelectedDrive("brand-new-drive");
    expect(window.location.pathname).toBe(ROOT);
    expect(window.ph?.selectedDriveId).toBeUndefined();

    // the drive registering later must not trigger a deferred navigation
    setDrives([makeDrive("brand-new-drive", "drive-id-7")]);
    expect(window.location.pathname).toBe(ROOT);
    expect(window.ph?.selectedDriveId).toBeUndefined();
  });

  it("selects immediately when the drive is already present", () => {
    setDrives([makeDrive("preview-5d7ab3ec", "drive-id-4")]);
    setSelectedDrive("preview-5d7ab3ec");

    expect(window.ph?.selectedDriveId).toBe("drive-id-4");
    expect(window.location.pathname).toBe("/d/preview-5d7ab3ec");
  });

  it("selects a full drive document immediately, even before it registers", () => {
    // e.g. AddDriveModal selecting the drive it just created — navigates in
    // without waiting for the drives collection to refresh
    window.history.replaceState(null, "", ROOT);
    setSelectedDrive(makeDrive("fresh-drive", "drive-id-8"));

    expect(window.ph?.selectedDriveId).toBe("drive-id-8");
    expect(window.location.pathname).toBe("/d/fresh-drive");
  });
});
