/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import utils from "../../gen/utils.js";
import type { SetSubgraphNameInput } from "../../gen/schema/index.js";
import { z } from "../../gen/schema/index.js";
import { reducer } from "../../gen/reducer.js";
import * as creators from "../../gen/base-operations/creators.js";
import type { SubgraphModuleDocument } from "../../gen/types.js";

describe("BaseOperations Operations", () => {
  let document: SubgraphModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle setSubgraphName operation", () => {
    const input: SetSubgraphNameInput = generateMock(
      z.SetSubgraphNameInputSchema(),
    );

    const updatedDocument = reducer(document, creators.setSubgraphName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_SUBGRAPH_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
