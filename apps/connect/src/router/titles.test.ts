import type { PHStore } from "@powerhousedao/reactor-browser";
import { driveCreateDocument } from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import { driveTitle } from "./titles.js";

function storeWith(globalName: string, headerName: string) {
  const drive = driveCreateDocument({
    global: { name: globalName, icon: null, nodes: [] },
  });
  drive.header.name = headerName;
  return { store: { drives: [drive] } as PHStore, driveId: drive.header.id };
}

describe("driveTitle", () => {
  it("names a drive added from Connect, whose header has no name", () => {
    const { store, driveId } = storeWith("Local", "");
    expect(driveTitle(store, { driveId })).toBe("Local · Connect");
  });

  it("names a renamed drive by its header", () => {
    const { store, driveId } = storeWith("Old", "Renamed");
    expect(driveTitle(store, { driveId }, "App")).toBe("Renamed · App");
  });
});
