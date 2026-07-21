// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const showPHModal = vi.hoisted(() => vi.fn());

vi.mock("@powerhousedao/reactor-browser", () => ({
  showPHModal,
}));

import type * as launchQueueModule from "./launch-queue.js";

type LaunchQueueModule = typeof launchQueueModule;

// A controllable window.launchQueue stub. Chromium buffers launches until a
// consumer registers; the stub just hands us the consumer to fire manually.
function installLaunchQueue() {
  let consumer: ((params: LaunchParams) => void) | undefined;
  const setConsumer = vi.fn((cb: (params: LaunchParams) => void) => {
    consumer = cb;
  });
  window.launchQueue = { setConsumer };
  return {
    setConsumer,
    launch: (files: FileSystemHandle[]) => consumer?.({ files }),
  };
}

function fileHandle(name: string, getFile?: () => Promise<File>) {
  return {
    kind: "file",
    name,
    getFile: getFile ?? (() => Promise.resolve(new File(["data"], name))),
  } as unknown as FileSystemFileHandle;
}

// Module-level state (init flag + pending files) needs a fresh module per test.
// Each instance also registers a window listener that fires whenever pending
// files exist, so the previous test's module must be emptied (afterEach) to
// keep its stale listener inert on the shared happy-dom window.
let currentModule: LaunchQueueModule | undefined;
async function loadModule(): Promise<LaunchQueueModule> {
  vi.resetModules();
  currentModule = await import("./launch-queue.js");
  return currentModule;
}

describe("launch-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.launchQueue;
    window.ph = {};
  });

  afterEach(() => {
    currentModule?.clearPendingImportFiles();
    currentModule = undefined;
  });

  it("is a no-op when the File Handling API is missing", async () => {
    const mod = await loadModule();
    expect(() => mod.initLaunchQueueFileHandling()).not.toThrow();
    expect(mod.getPendingImportFiles()).toEqual([]);
  });

  it("registers the consumer only once across repeated inits", async () => {
    const queue = installLaunchQueue();
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    mod.initLaunchQueueFileHandling();
    expect(queue.setConsumer).toHaveBeenCalledTimes(1);
  });

  it("ignores launches without files (plain focus launch)", async () => {
    const queue = installLaunchQueue();
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    queue.launch([]);
    await vi.waitFor(() => {
      expect(mod.getPendingImportFiles()).toEqual([]);
    });
    expect(showPHModal).not.toHaveBeenCalled();
  });

  it("ignores non-file handles", async () => {
    const queue = installLaunchQueue();
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    queue.launch([
      { kind: "directory", name: "dir" } as unknown as FileSystemHandle,
    ]);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mod.getPendingImportFiles()).toEqual([]);
    expect(showPHModal).not.toHaveBeenCalled();
  });

  it("stores launched files and opens the import modal", async () => {
    const queue = installLaunchQueue();
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    queue.launch([fileHandle("a.phd")]);
    await vi.waitFor(() => {
      expect(mod.getPendingImportFiles().map((f) => f.name)).toEqual(["a.phd"]);
    });
    expect(showPHModal).toHaveBeenCalledWith({ type: "openFileDocuments" });
  });

  it("merges files from repeated launches into the pending store", async () => {
    const queue = installLaunchQueue();
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    queue.launch([fileHandle("a.phd")]);
    await vi.waitFor(() => {
      expect(mod.getPendingImportFiles()).toHaveLength(1);
    });
    queue.launch([fileHandle("b.phdm")]);
    await vi.waitFor(() => {
      expect(mod.getPendingImportFiles().map((f) => f.name)).toEqual([
        "a.phd",
        "b.phdm",
      ]);
    });
    expect(showPHModal).toHaveBeenCalledTimes(2);
  });

  it("does not queue a file that is already pending (same name/size/mtime)", async () => {
    const mod = await loadModule();
    const file = new File(["data"], "a.phd", { lastModified: 1234 });
    mod.addPendingImportFiles([file]);
    mod.addPendingImportFiles([
      new File(["data"], "a.phd", { lastModified: 1234 }), // re-opened → dropped
      new File(["data"], "b.phd", { lastModified: 1234 }),
    ]);
    expect(mod.getPendingImportFiles().map((f) => f.name)).toEqual([
      "a.phd",
      "b.phd",
    ]);
  });

  it("skips only the handle whose getFile fails", async () => {
    const queue = installLaunchQueue();
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    queue.launch([
      fileHandle("broken.phd", () => Promise.reject(new Error("io error"))),
      fileHandle("ok.phd"),
    ]);
    await vi.waitFor(() => {
      expect(mod.getPendingImportFiles().map((f) => f.name)).toEqual([
        "ok.phd",
      ]);
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reopens the import modal when another modal closes with files pending", async () => {
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    mod.addPendingImportFiles([new File(["x"], "a.phd")]);
    showPHModal.mockClear();

    // The create-drive detour just closed: modal cleared, files still queued.
    window.ph = { modal: undefined };
    window.dispatchEvent(new CustomEvent("ph:modalUpdated"));
    expect(showPHModal).toHaveBeenCalledWith({ type: "openFileDocuments" });
  });

  it("does not reopen while a different modal is open", async () => {
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();
    mod.addPendingImportFiles([new File(["x"], "a.phd")]);
    showPHModal.mockClear();

    window.ph = { modal: { type: "addDrive" } };
    window.dispatchEvent(new CustomEvent("ph:modalUpdated"));
    expect(showPHModal).not.toHaveBeenCalled();
  });

  it("does not reopen when nothing is pending (cancel cleared the store)", async () => {
    const mod = await loadModule();
    mod.initLaunchQueueFileHandling();

    window.ph = { modal: undefined };
    window.dispatchEvent(new CustomEvent("ph:modalUpdated"));
    expect(showPHModal).not.toHaveBeenCalled();
  });

  it("notifies subscribers and swaps the snapshot reference on change", async () => {
    const mod = await loadModule();
    const listener = vi.fn();
    const unsubscribe = mod.subscribePendingImportFiles(listener);

    const before = mod.getPendingImportFiles();
    mod.addPendingImportFiles([new File(["x"], "x.phd")]);
    expect(listener).toHaveBeenCalledTimes(1);
    const after = mod.getPendingImportFiles();
    expect(after).not.toBe(before);
    // Stable reference between changes — required by useSyncExternalStore.
    expect(mod.getPendingImportFiles()).toBe(after);

    mod.clearPendingImportFiles();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(mod.getPendingImportFiles()).toEqual([]);
    // Clearing an already-empty store must not re-notify.
    mod.clearPendingImportFiles();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    mod.addPendingImportFiles([new File(["y"], "y.phd")]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
