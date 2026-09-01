import { generateMock } from "document-model/mock";
import {
  addStep,
  AddStepInputSchema,
  isWorkflowDocument,
  reducer,
  removeStep,
  RemoveStepInputSchema,
  setStepConfig,
  SetStepConfigInputSchema,
  updateStep,
  UpdateStepInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("StepsOperations", () => {
  it("should handle addStep operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddStepInputSchema());

    const updatedDocument = reducer(document, addStep(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_STEP");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateStep operation", () => {
    const document = utils.createDocument();
    const input = generateMock(UpdateStepInputSchema());

    const updatedDocument = reducer(document, updateStep(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_STEP",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeStep operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveStepInputSchema());

    const updatedDocument = reducer(document, removeStep(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_STEP",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setStepConfig operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetStepConfigInputSchema());

    const updatedDocument = reducer(document, setStepConfig(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_STEP_CONFIG",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
