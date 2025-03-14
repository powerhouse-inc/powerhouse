import { expect, it } from "vitest";
import { DocumentModelClass } from "../../src/document-model/gen/object.js";

it("should return a read only object on toDocument", () => {
  const model = new DocumentModelClass();

  expect(model.state.global.id).toBe("");

  const document = model.toDocument();

  expect(() => {
    // @ts-expect-error Cannot assign to 'id' because it is a read-only property.
    document.state.id = "test";
  }).toThrow("Cannot add property id, object is not extensible");
  expect(model.state.global.id).toBe("");
});
