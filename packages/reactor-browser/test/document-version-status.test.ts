import { describe, expect, it } from "vitest";
import { getDocumentVersionStatus } from "../src/hooks/document-version-status.js";

const pathAlways = () => true;
const pathNever = () => false;

describe("getDocumentVersionStatus", () => {
  it("returns current when the document is at the latest installed version", () => {
    expect(getDocumentVersionStatus(2, [1, 2], pathAlways)).toEqual({
      kind: "current",
      documentVersion: 2,
    });
  });

  it("returns upgrade-available when a newer version is installed", () => {
    expect(getDocumentVersionStatus(1, [1, 2], pathAlways)).toEqual({
      kind: "upgrade-available",
      documentVersion: 1,
      latestVersion: 2,
      canUpgrade: true,
    });
  });

  it("reports canUpgrade false when no upgrade path exists", () => {
    expect(getDocumentVersionStatus(1, [1, 2], pathNever)).toEqual({
      kind: "upgrade-available",
      documentVersion: 1,
      latestVersion: 2,
      canUpgrade: false,
    });
  });

  it("returns unsupported when the document is newer than anything installed", () => {
    expect(getDocumentVersionStatus(3, [1, 2], pathAlways)).toEqual({
      kind: "unsupported",
      documentVersion: 3,
      availableVersions: [1, 2],
    });
  });

  it("returns undefined when no versions are installed", () => {
    expect(getDocumentVersionStatus(1, [], pathAlways)).toBeUndefined();
  });
});
