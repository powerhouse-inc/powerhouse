import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  getDriveNode,
  invalidateDriveNodes,
  loadDriveNodes,
  useDriveNodes,
} from "../src/hooks/drive-nodes.js";
import { useNodesInSelectedDrive } from "../src/hooks/items-in-selected-drive.js";
import type { PHStore } from "../src/hooks/ph-store.js";
import { createPHStore, PHStoreProvider } from "../src/hooks/ph-store.js";
import type { IReactorBrowserClient } from "../src/types/reactor-browser-client.js";
import { fakeDriveReader } from "./utils/drive-nodes.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function fileNodes(count: number, prefix = "n"): Node[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    kind: "file",
    name: `${prefix}${i}`,
    documentType: "test/doc",
    parentFolder: null,
  })) as Node[];
}

function storeWith(nodesByDrive: Map<string, Node[]>, initial = {}) {
  const fake = fakeDriveReader((driveId) => nodesByDrive.get(driveId));
  const store = createPHStore({
    ...initial,
    reactorClient: {
      read: { drives: fake.reader },
    } as unknown as IReactorBrowserClient,
  });
  return { store, ...fake };
}

function wrapperFor(store: PHStore) {
  return ({ children }: PropsWithChildren) => (
    <PHStoreProvider store={store}>{children}</PHStoreProvider>
  );
}

describe("drive node cache", () => {
  it("pages through listNodes until the last page and marks the drive loaded", async () => {
    const nodes = fileNodes(2_500);
    const { store, listNodes } = storeWith(new Map([["d", nodes]]));

    const loaded = await loadDriveNodes("d", { store });

    expect(loaded.map((n) => n.id)).toEqual(nodes.map((n) => n.id));
    expect(listNodes).toHaveBeenCalledTimes(3);
    for (const call of listNodes.mock.calls) {
      expect(call[1]).toBeUndefined();
      expect(call[2]?.limit).toBe(1_000);
    }
    expect(listNodes.mock.calls.map((c) => c[2]?.cursor)).toEqual([
      "",
      "1000",
      "2000",
    ]);
    const entry = store.driveNodes?.get("d");
    expect(entry?.loaded).toBe("all");
    expect(entry?.byId.size).toBe(2_500);

    // Served from the cache once loaded.
    await loadDriveNodes("d", { store });
    expect(listNodes).toHaveBeenCalledTimes(3);
  });

  it("getDriveNode reads one node when the drive is not loaded, then serves it from the cache", async () => {
    const { store, listNodes, getNode } = storeWith(
      new Map([["d", fileNodes(3)]]),
    );

    expect((await getDriveNode("d", "n-1", { store }))?.name).toBe("n1");
    expect(await getDriveNode("d", "n-1", { store })).toBeDefined();
    expect(getNode).toHaveBeenCalledTimes(1);
    expect(listNodes).not.toHaveBeenCalled();
    expect(store.driveNodes?.get("d")?.loaded).toBe("partial");
    expect(await getDriveNode("d", "missing", { store })).toBeUndefined();
  });

  it("invalidation drops an unwatched drive and reloads a watched one", async () => {
    const nodesByDrive = new Map([
      ["watched", fileNodes(2, "a")],
      ["unwatched", fileNodes(1, "b")],
    ]);
    const { store, listNodes } = storeWith(nodesByDrive);
    await loadDriveNodes("unwatched", { store });
    invalidateDriveNodes("unwatched", store);
    expect(store.driveNodes?.has("unwatched")).toBe(false);

    const { result } = await renderHook(() => useDriveNodes("watched"), {
      wrapper: wrapperFor(store),
    });
    await expect.poll(() => result.current?.length).toBe(2);
    const before = listNodes.mock.calls.length;

    nodesByDrive.set("watched", fileNodes(3, "a"));
    invalidateDriveNodes("watched", store);
    // The old nodes stay visible while the reload runs.
    expect(result.current?.length).toBe(2);
    await expect.poll(() => result.current?.length).toBe(3);
    expect(listNodes.mock.calls.length).toBe(before + 1);
  });

  it("useNodesInSelectedDrive reads the selected drive's nodes from the cache", async () => {
    const drive = {
      header: { id: "d", slug: "d", name: "d" },
      state: { global: { name: "d", icon: null, nodes: [] } },
    } as unknown as DocumentDriveDocument;
    const nodes = fileNodes(4);
    const { store, listNodes } = storeWith(new Map([["d", nodes]]), {
      drives: [drive],
      selectedDriveId: "d",
    });

    const { result } = await renderHook(() => useNodesInSelectedDrive(), {
      wrapper: wrapperFor(store),
    });

    await expect
      .poll(() => result.current?.map((n) => n.id))
      .toEqual(nodes.map((n) => n.id));
    expect(listNodes).toHaveBeenCalledWith(
      "d",
      undefined,
      { limit: 1_000, cursor: "" },
      undefined,
    );
  });
});
