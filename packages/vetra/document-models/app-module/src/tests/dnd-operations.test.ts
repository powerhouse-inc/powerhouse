/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import utils from "../../gen/utils.js";
import {
  z,
  type SetDragAndDropEnabledInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../../gen/schema/index.js";
import { reducer } from "../../gen/reducer.js";
import * as creators from "../../gen/dnd-operations/creators.js";
import type { AppModuleDocument } from "../../gen/types.js";

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
  it("should handle addDocumentType operation", () => {
    const input: AddDocumentTypeInput = generateMock(
      z.AddDocumentTypeInputSchema(),
    );

    const updatedDocument = reducer(document, creators.addDocumentType(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_DOCUMENT_TYPE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle removeDocumentType operation", () => {
    const input: RemoveDocumentTypeInput = generateMock(
      z.RemoveDocumentTypeInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.removeDocumentType(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_DOCUMENT_TYPE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
