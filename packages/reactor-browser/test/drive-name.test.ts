import { driveCreateDocument } from "@powerhousedao/shared/document-drive";
import { describe, expect, it } from "vitest";
import { getDriveName } from "../src/utils/drives.js";

function drive(globalName: string, headerName: string) {
  const doc = driveCreateDocument({
    global: { name: globalName, icon: null, nodes: [] },
  });
  doc.header.name = headerName;
  return doc;
}

describe("getDriveName", () => {
  it("falls back to the creation name when the header has none", () => {
    // A drive from the Add Drive dialog.
    expect(getDriveName(drive("Local", ""))).toBe("Local");
  });

  it("prefers the header name, which a rename sets", () => {
    expect(getDriveName(drive("Old", "Renamed"))).toBe("Renamed");
  });

  it("uses the header name when the state has none", () => {
    // A remote drive.
    expect(getDriveName(drive("", "Remote"))).toBe("Remote");
  });
});
