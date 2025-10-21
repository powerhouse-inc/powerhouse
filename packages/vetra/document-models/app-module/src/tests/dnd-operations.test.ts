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

  describe("setDragAndDropEnabled", () => {
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

    it("should mutate state with new enabled value", () => {
      const input: SetDragAndDropEnabledInput = { enabled: false };

      const updatedDocument = reducer(
        document,
        creators.setDragAndDropEnabled(input),
      );

      expect(updatedDocument.state.global.isDragAndDropEnabled).toBe(false);
    });

    it("should enable drag and drop from initial state", () => {
      // Initial state has isDragAndDropEnabled = true
      expect(document.state.global.isDragAndDropEnabled).toBe(true);

      const updatedDocument = reducer(
        document,
        creators.setDragAndDropEnabled({ enabled: true }),
      );

      expect(updatedDocument.state.global.isDragAndDropEnabled).toBe(true);
    });

    it("should disable drag and drop", () => {
      const updatedDocument = reducer(
        document,
        creators.setDragAndDropEnabled({ enabled: false }),
      );

      expect(updatedDocument.state.global.isDragAndDropEnabled).toBe(false);
    });

    it("should toggle drag and drop in sequence", () => {
      let updatedDoc = reducer(
        document,
        creators.setDragAndDropEnabled({ enabled: false }),
      );
      expect(updatedDoc.state.global.isDragAndDropEnabled).toBe(false);

      updatedDoc = reducer(
        updatedDoc,
        creators.setDragAndDropEnabled({ enabled: true }),
      );
      expect(updatedDoc.state.global.isDragAndDropEnabled).toBe(true);

      updatedDoc = reducer(
        updatedDoc,
        creators.setDragAndDropEnabled({ enabled: false }),
      );
      expect(updatedDoc.state.global.isDragAndDropEnabled).toBe(false);

      expect(updatedDoc.operations.global).toHaveLength(3);
    });

    it("should update boolean field directly", () => {
      const updatedDocument = reducer(
        document,
        creators.setDragAndDropEnabled({ enabled: false }),
      );

      expect(updatedDocument.state.global.isDragAndDropEnabled).toBeDefined();
      expect(typeof updatedDocument.state.global.isDragAndDropEnabled).toBe(
        "boolean",
      );
    });
  });
});
