// What a processor does when it cannot coerce. The upstream processors answer
// undefined, and upstream pairs them with validators that turn that into
// "Expected JSON, received: …". We take the processors alone, so undefined has
// to mean "leave it to the piece" — or an author's value disappears before the
// action runs, which is how a model's prose-wrapped answer used to reach
// document-dispatch as nothing at all.
import { expect, it } from "vitest";
import { normalizePropsValue, normalizeValue } from "./normalize.js";

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
