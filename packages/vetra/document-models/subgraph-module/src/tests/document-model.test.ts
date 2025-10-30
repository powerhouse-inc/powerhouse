/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  reducer,
  setSubgraphName,
  setSubgraphStatus,
  utils,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import { describe, expect, it } from "vitest";

describe("Subgraph Module Document Model", () => {
  it("should have correct initial values", () => {
    const document = utils.createDocument();

    expect(document.state.global.name).toBe("");
    expect(document.state.global.status).toBe("DRAFT");
  });

  it("should handle multiple operations and maintain consistency", () => {
    const document = utils.createDocument();

    let updatedDoc = reducer(
      document,
      setSubgraphName({ name: "Test Subgraph" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      setSubgraphStatus({ status: "CONFIRMED" }),
    );

    // Verify state consistency
    expect(updatedDoc.state.global.name).toBe("Test Subgraph");
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
  });

  it("should handle complete workflow: set name and confirm status", () => {
    const document = utils.createDocument();

    // Step 1: Set subgraph name
    let updatedDoc = reducer(
      document,
      setSubgraphName({ name: "Production Subgraph" }),
    );
    expect(updatedDoc.state.global.name).toBe("Production Subgraph");

    // Step 2: Confirm subgraph status
    updatedDoc = reducer(
      updatedDoc,
      setSubgraphStatus({ status: "CONFIRMED" }),
    );
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");

    // Verify final state
    expect(updatedDoc.state.global.name).toBe("Production Subgraph");
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
  });
});
