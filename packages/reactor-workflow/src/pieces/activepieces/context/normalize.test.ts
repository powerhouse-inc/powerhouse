// What a processor does when it cannot coerce. The upstream processors answer
// undefined, and upstream's validators turn that into "Expected JSON,
// received: …". For JSON we hand the text to the piece instead, and skip that
// validator, or a model's prose-wrapped answer reaches the action as nothing.
import { expect, it } from "vitest";
import {
  normalizePropsValue,
  normalizeValue,
  preparePropsValue,
} from "./normalize.js";

const jsonProp = { type: "JSON", displayName: "Actions", required: true };

// The shape a reasoning model actually answers with: pages of deliberation,
// the object on the end, behind a leaked channel marker.
const MODEL_ANSWER =
  "We need to parse the OCR text and fill the fields.\n\nNow produce final " +
  'answer.assistantfinal{"actions":[{"type":"SET_COMMITMENT","input":{"customer":"BuildCorp AG"}}]}';

it("hands back a string the JSON processor cannot parse", async () => {
  expect(await normalizeValue(jsonProp, MODEL_ANSWER)).toBe(MODEL_ANSWER);
});

it("still parses a string that is strict JSON", async () => {
  const parsed = await normalizeValue(jsonProp, '{"actions":[]}');
  expect(parsed).toEqual({ actions: [] });
});

it("keeps a JSON key whose value it could not parse", async () => {
  const out = await normalizePropsValue(
    { actions: jsonProp },
    { actions: MODEL_ANSWER, documentId: "abc" },
  );
  // The regression this guards: `delete out[name]` here made the action see
  // no `actions` prop at all, and refuse an empty list rather than the text.
  expect(Object.keys(out).sort()).toEqual(["actions", "documentId"]);
  expect(out.actions).toBe(MODEL_ANSWER);
});

it("validates past a JSON value it could not parse", async () => {
  const out = await preparePropsValue(
    'action "dispatch"',
    { actions: jsonProp },
    { actions: MODEL_ANSWER },
  );
  expect(out.actions).toBe(MODEL_ANSWER);
});

it("refuses an empty required JSON value", async () => {
  await expect(
    preparePropsValue(
      'action "dispatch"',
      { actions: jsonProp },
      { actions: "" },
    ),
  ).rejects.toThrow(
    'Invalid input for action "dispatch": Actions (actions): Expected JSON, received: ',
  );
});

// Narrow on purpose. Every other type keeps its promise to the piece, and
// those drops are deliberate — a DATE_TIME prop is an ISO string or nothing.
it("still drops what a non-JSON processor cannot read", async () => {
  const when = { type: "DATE_TIME", displayName: "When", required: false };
  expect(await normalizeValue(when, "tomorrow-ish")).toBeUndefined();
  const count = { type: "NUMBER", displayName: "Count", required: false };
  expect(await normalizeValue(count, "abc")).toBeNaN();
});

it("drops an empty JSON value rather than passing the empty string on", async () => {
  expect(await normalizeValue(jsonProp, "")).toBeUndefined();
});
