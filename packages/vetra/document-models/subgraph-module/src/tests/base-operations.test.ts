/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import type {
  SetSubgraphNameInput,
  SubgraphModuleDocument,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import {
  reducer,
  setSubgraphName,
  setSubgraphStatus,
  utils,
  isSubgraphModuleDocument,
  SetSubgraphNameInputSchema,
  SetSubgraphStatusInputSchema,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import { beforeEach, describe, expect, it } from "vitest";
import { generateMock } from "@powerhousedao/codegen";

describe("BaseOperations Operations", () => {
  let document: SubgraphModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setSubgraphName", () => {
    it("should mutate state with new name", () => {
      const input: SetSubgraphNameInput = { name: "My Subgraph" };

      const updatedDocument = reducer(document, setSubgraphName(input));

      expect(updatedDocument.state.global.name).toBe("My Subgraph");
    });

    it("should reject empty string and store error in operation", () => {
      const input: SetSubgraphNameInput = { name: "" };

      const updatedDocument = reducer(document, setSubgraphName(input));

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].error).toBe(
        "Subgraph name cannot be empty",
      );
      expect(updatedDocument.state.global.name).toBe("");
    });
  });

  describe("setSubgraphStatus", () => {
    it("should mutate state with new status", () => {
      const input = { status: "CONFIRMED" as const };

      const updatedDocument = reducer(document, setSubgraphStatus(input));

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from DRAFT to CONFIRMED", () => {
      expect(document.state.global.status).toBe("DRAFT");

      const updatedDocument = reducer(
        document,
        setSubgraphStatus({ status: "CONFIRMED" }),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from CONFIRMED to DRAFT", () => {
      const confirmedDoc = reducer(
        document,
        setSubgraphStatus({ status: "CONFIRMED" }),
      );

      const updatedDocument = reducer(
        confirmedDoc,
        setSubgraphStatus({ status: "DRAFT" }),
      );

      expect(updatedDocument.state.global.status).toBe("DRAFT");
    });
  });

  it("should handle setSubgraphName operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetSubgraphNameInputSchema());

    const updatedDocument = reducer(document, setSubgraphName(input));

    expect(isSubgraphModuleDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_SUBGRAPH_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setSubgraphStatus operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetSubgraphStatusInputSchema());

    const updatedDocument = reducer(document, setSubgraphStatus(input));

    expect(isSubgraphModuleDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_SUBGRAPH_STATUS",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
