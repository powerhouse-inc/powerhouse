import type {
  PHBaseState,
  Reducer,
} from "@powerhousedao/shared/document-model";
import {
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  createMinimalZip,
  documentModelReducer,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";

const reducer = documentModelReducer as unknown as Reducer<PHBaseState>;

describe("phd without base-reducer protocol version", () => {
  it("imports a createMinimalZip backup as base-reducer 1", async () => {
    const zip = await createMinimalZip({
      documentId: "doc-1",
      documentType: "powerhouse/document-model",
      branch: "main",
      name: "Minimal",
      state: {
        auth: { version: 0, grants: [] },
        document: { version: 1 },
        global: {},
        local: {},
      } as unknown as PHBaseState,
    });

    // Same order as reactor-browser loadFile: legacy replay, then versioned.
    await baseLoadFromInput(zip, reducer, { checkHashes: true });
    const doc = await baseLoadFromInputVersioned(zip, {
      reducers: { 1: reducer },
    });

    expect(doc.header.protocolVersions?.["base-reducer"]).toBe(1);
  });
});
