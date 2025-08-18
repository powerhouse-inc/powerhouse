/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import utils from "../../gen/utils.js";
import {
  z,
  type SetAppNameInput,
  type SetAppStatusInput,
} from "../../gen/schema/index.js";
import { reducer } from "../../gen/reducer.js";
import * as creators from "../../gen/base-operations/creators.js";
import type { AppModuleDocument } from "../../gen/types.js";

describe("BaseOperations Operations", () => {
  let document: AppModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle setAppName operation", () => {
    const input: SetAppNameInput = generateMock(z.SetAppNameInputSchema());

    const updatedDocument = reducer(document, creators.setAppName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_APP_NAME");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setAppStatus operation", () => {
    const input: SetAppStatusInput = generateMock(z.SetAppStatusInputSchema());

    const updatedDocument = reducer(document, creators.setAppStatus(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_APP_STATUS");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
