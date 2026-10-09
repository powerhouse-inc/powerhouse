// @vitest-environment happy-dom
import type { IReactorClient } from "@powerhousedao/reactor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renameDrive } from "../src/actions/drive.js";
import { upgradeDocument } from "../src/actions/document.js";
import {
  addFullReactorClientEventHandler,
  getFullReactorClient,
  setFullReactorClient,
} from "../src/hooks/reactor.js";
import type { PHGlobal } from "../src/types/global.js";

function client(name: string) {
  return {
    name,
    rename: vi.fn(() => Promise.resolve({ id: "drive-1" })),
    upgradeDocument: vi.fn(() => Promise.resolve({ id: "doc-1" })),
  };
}

afterEach(() => {
  window.ph = {};
});

describe("full-client actions", () => {
  it("go through the routed client when one is set", async () => {
    const local = client("local");
    const routed = client("routed");
    window.ph = {
      reactorClientModule: { client: local },
      fullReactorClient: routed,
    } as unknown as PHGlobal;

    await renameDrive("drive-1", "Renamed");
    await upgradeDocument("doc-1", 2);

    expect(routed.rename).toHaveBeenCalledWith("drive-1", "Renamed");
    expect(routed.upgradeDocument).toHaveBeenCalledWith("doc-1", 2);
    expect(local.rename).not.toHaveBeenCalled();
    expect(local.upgradeDocument).not.toHaveBeenCalled();
  });

  it("use the module client when nothing is routed", async () => {
    const local = client("local");
    window.ph = {
      reactorClientModule: { client: local },
    } as unknown as PHGlobal;

    await renameDrive("drive-1", "Renamed");
    await upgradeDocument("doc-1", 2);

    expect(local.rename).toHaveBeenCalledWith("drive-1", "Renamed");
    expect(local.upgradeDocument).toHaveBeenCalledWith("doc-1", 2);
  });

  it("are handed the routed client through the setter", () => {
    const local = client("local");
    const routed = client("routed");
    window.ph = {
      reactorClientModule: { client: local },
    } as unknown as PHGlobal;
    addFullReactorClientEventHandler();
    expect(getFullReactorClient()).toBe(local);

    setFullReactorClient(routed as unknown as IReactorClient);
    expect(getFullReactorClient()).toBe(routed);

    setFullReactorClient(undefined);
    expect(getFullReactorClient()).toBe(local);
  });
});
