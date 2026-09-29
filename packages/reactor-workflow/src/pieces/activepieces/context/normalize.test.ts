// What a processor does when it cannot coerce: it answers undefined, and for
// JSON and OBJECT props validation then names the prop and the text.
import { expect, it } from "vitest";
import {
  normalizePropsValue,
  normalizeValue,
  preparePropsValue,
} from "./normalize.js";

const jsonProp = { type: "JSON", displayName: "Actions", required: true };
const optionalJson = { type: "JSON", displayName: "Extra", required: false };
const objectProp = { type: "OBJECT", displayName: "Headers", required: false };

// A model's prose-wrapped answer, which is not JSON.
const MODEL_ANSWER =
  "We need to parse the OCR text and fill the fields.\n\nNow produce final " +
  'answer.assistantfinal{"actions":[{"type":"SET_COMMITMENT","input":{"customer":"BuildCorp AG"}}]}';

it("drops a string the JSON processor cannot parse", async () => {
  expect(await normalizeValue(jsonProp, MODEL_ANSWER)).toBeUndefined();
});

it("still parses a string that is strict JSON", async () => {
  const parsed = await normalizeValue(jsonProp, '{"actions":[]}');
  expect(parsed).toEqual({ actions: [] });
});

it("refuses unparseable JSON text, naming the prop", async () => {
  await expect(
    preparePropsValue(
      'action "dispatch"',
      { actions: jsonProp },
      { actions: MODEL_ANSWER },
    ),
  ).rejects.toThrow(
    /Invalid input for action "dispatch": Actions \(actions\): is not valid JSON, received: We need/,
  );
});

it("refuses unparseable text for an optional JSON prop too", async () => {
  // Optional, the validator would read the dropped value as simply unset.
  await expect(
    preparePropsValue('action "x"', { extra: optionalJson }, { extra: "{a" }),
  ).rejects.toThrow(/Extra \(extra\): is not valid JSON/);
});

it("refuses an OBJECT prop given text or a list that is not an object", async () => {
  for (const headers of ["not json", "[1,2]", [1, 2]]) {
    await expect(
      preparePropsValue('action "x"', { headers: objectProp }, { headers }),
    ).rejects.toThrow(/Headers \(headers\): expects a JSON object/);
  }
  expect(
    await preparePropsValue(
      'action "x"',
      { headers: objectProp },
      { headers: '{"a":"1"}' },
    ),
  ).toEqual({ headers: { a: "1" } });
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

it("drops unparseable JSON without throwing where nothing validates", async () => {
  // Teardown normalises without validating, and must still run.
  const out = await normalizePropsValue(
    { actions: jsonProp },
    { actions: MODEL_ANSWER, documentId: "abc" },
  );
  expect(out).toEqual({ documentId: "abc" });
});

// Every other type keeps its promise to the piece: a DATE_TIME prop is an ISO
// string or nothing.
it("still drops what a non-JSON processor cannot read", async () => {
  const when = { type: "DATE_TIME", displayName: "When", required: false };
  expect(await normalizeValue(when, "tomorrow-ish")).toBeUndefined();
  const count = { type: "NUMBER", displayName: "Count", required: false };
  expect(await normalizeValue(count, "abc")).toBeNaN();
});

it("drops an empty JSON value rather than passing the empty string on", async () => {
  expect(await normalizeValue(jsonProp, "")).toBeUndefined();
});
