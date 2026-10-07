import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  DriveInspection,
  type InspectorDocumentReader,
} from "../../src/inspector/drive-inspection.js";

function doc(id: string, global: unknown = {}): PHDocument {
  return {
    header: { id, name: id, branch: "main", documentType: "t" },
    state: { global },
  } as unknown as PHDocument;
}

const fileNode = (id: string) => ({ id, kind: "file", documentType: "t" });

describe("DriveInspection integrity", () => {
  it("reports a file withheld from the caller exactly as one that is absent", async () => {
    const stored = new Set(["served", "withheld"]);
    const servedToCaller = new Set(["served"]);
    const reader: InspectorDocumentReader = {
      get: () =>
        Promise.resolve(
          doc("drive", {
            nodes: [
              fileNode("served"),
              fileNode("withheld"),
              fileNode("absent"),
            ],
          }),
        ),
      find: (search) =>
        Promise.resolve({
          results: (search.ids ?? [])
            .filter((id) => stored.has(id) && servedToCaller.has(id))
            .map((id) => doc(id)),
          options: { cursor: "", limit: 10 },
        }),
    };

    const integrity = await new DriveInspection(reader).checkDriveIntegrity(
      "drive",
      "main",
    );

    expect(integrity.missingDocuments).toEqual([
      { id: "withheld", documentType: "t" },
      { id: "absent", documentType: "t" },
    ]);
  });
});
