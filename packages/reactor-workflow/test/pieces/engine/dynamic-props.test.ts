import { describe, expect, it } from "vitest";
import {
  checkDynamicProperties,
  DynamicPropertiesError,
} from "../../../src/pieces/engine/dynamic-props.js";

const schema = {
  title: { displayName: "Title", type: "SHORT_TEXT", required: true },
  note: { displayName: "Note", type: "LONG_TEXT", required: false },
};

describe("checkDynamicProperties", () => {
  it("passes a value carrying every required child", () => {
    expect(() =>
      checkDynamicProperties({ fields: { title: "x" } }, [
        { prop: "fields", mode: "MANUAL", schema },
      ]),
    ).not.toThrow();
  });

  it("ignores settings without a schema", () => {
    expect(() =>
      checkDynamicProperties({}, [
        { prop: "fields", mode: "EXPRESSION", schema: null },
      ]),
    ).not.toThrow();
  });

  it("names the missing children, from a descriptor list too", () => {
    const check = () =>
      checkDynamicProperties({ fields: { title: "" } }, [
        {
          prop: "fields",
          mode: "MANUAL",
          schema: [
            { name: "title", displayName: "Title", required: true },
            { name: "id", required: true },
          ],
        },
      ]);
    expect(check).toThrow(DynamicPropertiesError);
    expect(check).toThrow(
      'Property "fields" is missing required fields: Title (title), id',
    );
  });

  it("refuses a value that is not an object", () => {
    expect(() =>
      checkDynamicProperties({ fields: "title=x" }, [
        { prop: "fields", mode: "MANUAL", schema },
      ]),
    ).toThrow('Property "fields" must be an object of fields, received string');
  });
});
