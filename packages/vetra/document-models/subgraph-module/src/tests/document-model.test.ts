/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import utils, {
  initialGlobalState,
  initialLocalState,
} from "../../gen/utils.js";

describe("Subgraph Module Document Model", () => {
  it("should create a new Subgraph Module document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe("powerhouse/subgraph");
  });

  it("should create a new Subgraph Module document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
  });

  it("should generate a valid document ID", () => {
    const document = utils.createDocument();

    expect(document.header.id).toBeDefined();
    expect(document.header.id).not.toBe("");
    expect(typeof document.header.id).toBe("string");
  });

  it("should have correct document type", () => {
    const document = utils.createDocument();

    expect(document.header.documentType).toBe("powerhouse/subgraph");
  });

  it("should have correct initial values", () => {
    const document = utils.createDocument();

    expect(document.state.global.name).toBe("");
    expect(document.state.global.status).toBe("DRAFT");
  });

  it("should start with empty operation history", () => {
    const document = utils.createDocument();

    expect(document.operations.global).toEqual([]);
    expect(document.operations.global).toHaveLength(0);
  });

  it("should handle multiple operations and maintain consistency", () => {
    const document = utils.createDocument();

    let updatedDoc = reducer(
      document,
      creators.setSubgraphName({ name: "Test Subgraph" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setSubgraphStatus({ status: "CONFIRMED" }),
    );

    // Verify operation ordering
    expect(updatedDoc.operations.global).toHaveLength(2);
    expect(updatedDoc.operations.global[0].index).toBe(0);
    expect(updatedDoc.operations.global[1].index).toBe(1);

    // Verify state consistency
    expect(updatedDoc.state.global.name).toBe("Test Subgraph");
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
  });

  it("should handle complete workflow: set name and confirm status", () => {
    const document = utils.createDocument();

    // Step 1: Set subgraph name
    let updatedDoc = reducer(
      document,
      creators.setSubgraphName({ name: "Production Subgraph" }),
    );
    expect(updatedDoc.state.global.name).toBe("Production Subgraph");

    // Step 2: Confirm subgraph status
    updatedDoc = reducer(
      updatedDoc,
      creators.setSubgraphStatus({ status: "CONFIRMED" }),
    );
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");

    // Verify final state
    expect(updatedDoc.operations.global).toHaveLength(2);
    expect(updatedDoc.state.global.name).toBe("Production Subgraph");
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
  });
});
