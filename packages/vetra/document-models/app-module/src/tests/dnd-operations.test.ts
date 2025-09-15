/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/dnd-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import { z, type SetDragAndDropEnabledInput } from "../../gen/schema/index.js";
import type { AppModuleDocument } from "../../gen/types.js";
import utils from "../../gen/utils.js";

describe("DndOperations Operations", () => {
  let document: AppModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle setDragAndDropEnabled operation", () => {
    const input: SetDragAndDropEnabledInput = generateMock(
      z.SetDragAndDropEnabledInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setDragAndDropEnabled(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_DRAG_AND_DROP_ENABLED",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
