---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/test/example.test.ts"
force: true
---
import { transmit } from "../src/listener";
import { actions } from "../../../document-models/document-drive";
import { describe, it } from "vitest";
import get from "../src/service";

describe("processor example test", () => {
  it("should count amount of operations", async () => {
    const exampleEntry = actions.addFile({
      documentType: "powerhouse/budget-statement",
      id: "1",
      name: "test",
      synchronizationUnits: [],
    });

    await transmit([
      {
        branch: "main",
        documentId: "1",
        driveId: "1",
        operations: [
          { ...exampleEntry, timestamp: "1", index: 1, skip: 0, hash: "1" },
        ],
        scope: "global",
        state: {},
      },
    ]);

    const analyticsStore = get();
    // @todo: add test
  });
});
