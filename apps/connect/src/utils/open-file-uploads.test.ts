// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addFileWithProgress: vi.fn(),
  setSelectedNode: vi.fn(),
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  addFileWithProgress: mocks.addFileWithProgress,
  setSelectedNode: mocks.setSelectedNode,
}));

// open-file-uploads reuses formatFileSize + mapProgressStageToStatus from the
// design-system barrel; stub them (faithful to the real impls) so the test
// doesn't pull the whole component barrel into happy-dom.
vi.mock("@powerhousedao/design-system/connect", () => ({
  formatFileSize: (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },
  mapProgressStageToStatus: (stage: string) => {
    switch (stage) {
      case "uploading":
        return "uploading";
      case "complete":
        return "success";
      case "failed":
        return "failed";
      case "conflict":
        return "conflict";
      case "unsupported-document-type":
        return "unsupported-document-type";
      default:
        return "pending";
    }
  },
}));

import type * as uploadsModule from "./open-file-uploads.js";

type UploadsModule = typeof uploadsModule;

type ProgressCallback = (progress: {
  stage: string;
  progress: number;
  fileNode?: { id: string };
  error?: string;
}) => void;

// The module keeps state (rows, batch chain, counter) at module level, so
// each test loads a fresh instance.
async function loadModule(): Promise<UploadsModule> {
  vi.resetModules();
  return import("./open-file-uploads.js");
}

/** Scripted addFileWithProgress: returns per-call progress control. */
function scriptImports() {
  const calls: {
    file: File;
    driveId: string;
    name: string;
    parentFolder: unknown;
    onProgress: ProgressCallback;
    documentTypes: unknown;
    resolveConflict: unknown;
    resolve: (value?: unknown) => void;
  }[] = [];
  mocks.addFileWithProgress.mockImplementation(
    (
      file: File,
      driveId: string,
      name: string,
      parentFolder: unknown,
      onProgress: ProgressCallback,
      documentTypes: unknown,
      resolveConflict: unknown,
    ) =>
      new Promise((resolve) => {
        calls.push({
          file,
          driveId,
          name,
          parentFolder,
          onProgress,
          documentTypes,
          resolveConflict,
          resolve,
        });
      }),
  );
  return calls;
}

const completeCall = (
  call: { onProgress: ProgressCallback; resolve: (v?: unknown) => void },
  nodeId: string,
) => {
  call.onProgress({
    stage: "complete",
    progress: 100,
    fileNode: { id: nodeId },
  });
  call.resolve({ id: nodeId });
};

describe("open-file-uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues visible rows immediately with formatted size and final name", async () => {
    const mod = await loadModule();
    scriptImports();
    void mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [
        { file: new File(["x".repeat(2048)], "a.phd"), name: "a (copy) 1" },
      ],
      documentTypes: undefined,
    });
    const rows = mod.getOpenFileUploads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fileName: "a (copy) 1",
      fileSize: "2 KB",
      status: "pending",
      progress: 0,
    });
  });

  it("always imports into the drive root with the duplicate resolution", async () => {
    const mod = await loadModule();
    const calls = scriptImports();
    void mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [{ file: new File(["x"], "a.phd"), name: "a" }],
      documentTypes: ["t"],
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].driveId).toBe("drive-1");
    expect(calls[0].name).toBe("a");
    expect(calls[0].parentFolder).toBeUndefined();
    expect(calls[0].documentTypes).toEqual(["t"]);
    expect(calls[0].resolveConflict).toBe("duplicate");
  });

  it("tracks progress stages through to success", async () => {
    const mod = await loadModule();
    const calls = scriptImports();
    void mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [{ file: new File(["x"], "a.phd"), name: "a" }],
      documentTypes: undefined,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    calls[0].onProgress({ stage: "uploading", progress: 40 });
    expect(mod.getOpenFileUploads()[0]).toMatchObject({
      status: "uploading",
      progress: 40,
    });

    completeCall(calls[0], "node-1");
    await vi.waitFor(() => {
      expect(mod.getOpenFileUploads()[0]).toMatchObject({
        status: "success",
        progress: 100,
        fileNode: { id: "node-1" },
      });
    });
  });

  it("imports sequentially and keeps going past failures", async () => {
    const mod = await loadModule();
    const calls = scriptImports();
    void mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [
        { file: new File(["x"], "bad.phd"), name: "bad" },
        { file: new File(["y"], "good.phd"), name: "good" },
      ],
      documentTypes: undefined,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls).toHaveLength(1); // second not started yet

    calls[0].onProgress({ stage: "failed", progress: 100, error: "corrupt" });
    calls[0].resolve(undefined);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(mod.getOpenFileUploads()[0]).toMatchObject({
      status: "failed",
      errorDetails: "corrupt",
    });

    completeCall(calls[1], "node-good");
    await vi.waitFor(() => {
      expect(mod.getOpenFileUploads()[1]).toMatchObject({ status: "success" });
    });
  });

  it("auto-opens a single-file batch on success, but never multi-file batches", async () => {
    const mod = await loadModule();
    const calls = scriptImports();
    const single = mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [{ file: new File(["x"], "a.phd"), name: "a" }],
      documentTypes: undefined,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    completeCall(calls[0], "node-1");
    await single;
    expect(mocks.setSelectedNode).toHaveBeenCalledWith({ id: "node-1" });

    mocks.setSelectedNode.mockClear();
    const multi = mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [
        { file: new File(["x"], "b.phd"), name: "b" },
        { file: new File(["y"], "c.phd"), name: "c" },
      ],
      documentTypes: undefined,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    completeCall(calls[1], "node-b");
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    completeCall(calls[2], "node-c");
    await multi;
    expect(mocks.setSelectedNode).not.toHaveBeenCalled();
  });

  it("still auto-opens when the fileNode arrives only via progress (discovery retry)", async () => {
    const mod = await loadModule();
    const calls = scriptImports();
    const batch = mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [{ file: new File(["x"], "a.phd"), name: "a" }],
      documentTypes: undefined,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    // Discovery path: the promise resolves undefined early…
    calls[0].resolve(undefined);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mocks.setSelectedNode).not.toHaveBeenCalled();
    // …and the terminal stage streams in later.
    calls[0].onProgress({
      stage: "complete",
      progress: 100,
      fileNode: { id: "node-late" },
    });
    await batch;
    expect(mocks.setSelectedNode).toHaveBeenCalledWith({ id: "node-late" });
  });

  it("serializes concurrent batches while showing their rows immediately", async () => {
    const mod = await loadModule();
    const calls = scriptImports();
    void mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [{ file: new File(["x"], "a.phd"), name: "a" }],
      documentTypes: undefined,
    });
    const second = mod.runOpenFileImports({
      driveId: "drive-2",
      imports: [{ file: new File(["y"], "b.phd"), name: "b" }],
      documentTypes: undefined,
    });
    // Both rows visible, but only the first import started.
    expect(mod.getOpenFileUploads()).toHaveLength(2);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls).toHaveLength(1);

    completeCall(calls[0], "node-a");
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].driveId).toBe("drive-2");
    completeCall(calls[1], "node-b");
    await second;
  });

  it("supports row removal, clear-all, and stable snapshots", async () => {
    const mod = await loadModule();
    scriptImports();
    void mod.runOpenFileImports({
      driveId: "drive-1",
      imports: [
        { file: new File(["x"], "a.phd"), name: "a" },
        { file: new File(["y"], "b.phd"), name: "b" },
      ],
      documentTypes: undefined,
    });
    const listener = vi.fn();
    const unsubscribe = mod.subscribeOpenFileUploads(listener);

    const snapshot = mod.getOpenFileUploads();
    expect(mod.getOpenFileUploads()).toBe(snapshot); // stable between changes

    mod.removeOpenFileUpload(snapshot[0].id);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mod.getOpenFileUploads()).toHaveLength(1);

    mod.clearOpenFileUploads();
    expect(mod.getOpenFileUploads()).toEqual([]);
    // Clearing an empty store must not re-notify.
    mod.clearOpenFileUploads();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
