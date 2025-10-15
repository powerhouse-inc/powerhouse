/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import type { SetSubgraphNameInput } from "../../gen/schema/index.js";
import type { SubgraphModuleDocument } from "../../gen/types.js";
import utils from "../../gen/utils.js";

describe("BaseOperations Operations", () => {
  let document: SubgraphModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setSubgraphName", () => {
    it("should mutate state with new name", () => {
      const input: SetSubgraphNameInput = { name: "My Subgraph" };

      const updatedDocument = reducer(
        document,
        creators.setSubgraphName(input),
      );

      expect(updatedDocument.state.global.name).toBe("My Subgraph");
    });

    it("should reject empty string and store error in operation", () => {
      const input: SetSubgraphNameInput = { name: "" };

      const updatedDocument = reducer(
        document,
        creators.setSubgraphName(input),
      );

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

      const updatedDocument = reducer(
        document,
        creators.setSubgraphStatus(input),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from DRAFT to CONFIRMED", () => {
      expect(document.state.global.status).toBe("DRAFT");

      const updatedDocument = reducer(
        document,
        creators.setSubgraphStatus({ status: "CONFIRMED" }),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from CONFIRMED to DRAFT", () => {
      const confirmedDoc = reducer(
        document,
        creators.setSubgraphStatus({ status: "CONFIRMED" }),
      );

      const updatedDocument = reducer(
        confirmedDoc,
        creators.setSubgraphStatus({ status: "DRAFT" }),
      );

      expect(updatedDocument.state.global.status).toBe("DRAFT");
    });
  });
});
