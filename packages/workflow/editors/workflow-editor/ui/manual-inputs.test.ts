import { describe, expect, it } from "vitest";
import {
  coerceManualPayload,
  manualInputProp,
  manualInputValues,
  manualRunPayload,
  parseManualInputs,
} from "./manual-inputs.js";
import { parseManualOptions } from "@powerhousedao/pieces-framework/workflow";

const inputs = parseManualInputs({
  inputs: [
    { displayName: "Email", name: "email", type: "text", required: true },
    { displayName: "Notes", name: "notes", type: "text_area" },
    {
      displayName: "Amount",
      name: "amount",
      type: "number",
      required: true,
      defaultValue: "10",
    },
    { displayName: "Urgent", name: "urgent", type: "toggle", required: true },
    { displayName: "Due", name: "due", type: "date" },
    {
      displayName: "Tier",
      name: "tier",
      type: "dropdown",
      options: "gold\n\nsilver\ngold",
      description: "Pick one",
    },
    {
      displayName: "Meta",
      name: "meta",
      type: "json",
      defaultValue: '{"a":1}',
    },
    {
      displayName: "Region",
      name: "region",
      type: "dropdown",
      options: "Europe = eu\n\nUnited States = us\nEU again = eu\n = bare",
      defaultValue: "United States",
    },
  ],
});

describe("manualInputProp", () => {
  it("maps each field type to the matching piece property", () => {
    expect(inputs.map(manualInputProp)).toEqual([
      {
        name: "email",
        displayName: "Email",
        type: "SHORT_TEXT",
        required: true,
      },
      {
        name: "notes",
        displayName: "Notes",
        type: "LONG_TEXT",
        required: false,
      },
      {
        name: "amount",
        displayName: "Amount",
        type: "NUMBER",
        required: true,
        defaultValue: 10,
      },
      {
        name: "urgent",
        displayName: "Urgent",
        type: "CHECKBOX",
        required: false,
      },
      { name: "due", displayName: "Due", type: "DATE_TIME", required: false },
      {
        name: "tier",
        displayName: "Tier",
        type: "STATIC_DROPDOWN",
        required: false,
        description: "Pick one",
        staticOptions: [
          { value: "gold", label: "gold" },
          { value: "silver", label: "silver" },
        ],
      },
      {
        name: "meta",
        displayName: "Meta",
        type: "JSON",
        required: false,
        defaultValue: { a: 1 },
      },
      {
        name: "region",
        displayName: "Region",
        type: "STATIC_DROPDOWN",
        required: false,
        defaultValue: "us",
        staticOptions: [
          { value: "eu", label: "Europe" },
          { value: "us", label: "United States" },
          { value: "bare", label: "bare" },
        ],
      },
    ]);
  });

  it("starts the form from the defaults, toggles off", () => {
    expect(manualInputValues(inputs)).toEqual({
      amount: 10,
      urgent: false,
      meta: { a: 1 },
      region: "us",
    });
  });
});

describe("parseManualOptions", () => {
  it("splits Label = value on the first separator, a bare line is both", () => {
    expect(
      parseManualOptions("a\n  \nLabel = v = w\nb = \nc=d\nSame = a"),
    ).toEqual([
      { label: "a", value: "a" },
      { label: "Label", value: "v = w" },
      { label: "c=d", value: "c=d" },
    ]);
  });

  it("takes a list of strings or of label and value", () => {
    expect(
      parseManualOptions(["x", { label: "Why", value: "y" }, { value: "z" }]),
    ).toEqual([
      { label: "x", value: "x" },
      { label: "Why", value: "y" },
      { label: "z", value: "z" },
    ]);
  });
});

describe("coerceManualPayload", () => {
  it("coerces text values to each field's type and keeps unknown keys", () => {
    expect(
      coerceManualPayload(inputs, {
        email: "a@b.c",
        amount: " 2.5 ",
        urgent: "false",
        due: "2026-11-01T09:30:00Z",
        tier: "silver",
        region: "eu",
        extra: 1,
      }),
    ).toEqual({
      email: "a@b.c",
      amount: 2.5,
      urgent: false,
      due: "2026-11-01T09:30:00.000Z",
      tier: "silver",
      region: "eu",
      meta: { a: 1 },
      extra: 1,
    });
  });

  it("names every field it refuses, by label in the run form", () => {
    expect(() =>
      manualRunPayload(inputs, {
        email: "",
        amount: "ten",
        urgent: "yes",
        due: "tomorrow",
        tier: "bronze",
        region: "Europe",
      }),
    ).toThrow(
      'Email is required; Amount must be a number; Urgent must be true or false; Due must be an ISO 8601 date; Tier must be one of "gold", "silver"; Region must be one of "eu", "us"',
    );
  });

  it("checks nothing without inputs", () => {
    expect(coerceManualPayload([], { any: "thing" })).toEqual({ any: "thing" });
    expect(parseManualInputs({ inputs: "nope" })).toEqual([]);
  });
});
