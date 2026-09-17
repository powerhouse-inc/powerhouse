// What a model actually says, and what the piece is prepared to read out of it.
import { describe, expect, it } from "vitest";
import {
  parseCreatePayload,
  parseDispatchPayload,
  parseModelJson,
} from "./parse.js";

const ACTIONS =
  '{"actions":[{"type":"SET_COMMITMENT","input":{"customer":"Brenner"}}]}';

describe("parseModelJson", () => {
  it("reads plain JSON", () => {
    expect(parseModelJson(ACTIONS)).toMatchObject({
      actions: [{ type: "SET_COMMITMENT" }],
    });
  });

  it("reads fenced JSON, which models emit whatever the prompt says", () => {
    expect(parseModelJson("```json\n" + ACTIONS + "\n```")).toMatchObject({
      actions: [{ type: "SET_COMMITMENT" }],
    });
  });

  it("reads the answer out of a reasoning model's deliberation", () => {
    // Verbatim shape from a live run: pages of thinking, a leaked channel
    // marker, and the object on the last line.
    const text = `We need to parse OCR text.\n\nThe buyer is Brenner.\n\nNow produce final answer.assistantfinal${ACTIONS}`;

    expect(parseModelJson(text)).toMatchObject({
      actions: [{ type: "SET_COMMITMENT", input: { customer: "Brenner" } }],
    });
  });

  it("prefers the last value, so an example quoted from the prompt does not win", () => {
    const text = `The prompt showed {"actions": [{"type": "EXAMPLE", "input": {}}]} as the shape.\n\nassistantfinal${ACTIONS}`;

    expect(parseModelJson(text)).toMatchObject({
      actions: [{ type: "SET_COMMITMENT" }],
    });
  });

  it("is not fooled by a brace inside a string", () => {
    const text =
      'Thinking: the note said "a } here".\n' +
      '{"actions":[{"type":"SET_NAME","input":{"name":"a } here"}}]}';

    expect(parseModelJson(text)).toMatchObject({
      actions: [{ type: "SET_NAME", input: { name: "a } here" } }],
    });
  });

  it("throws when there is no JSON at all, rather than inventing one", () => {
    expect(() => parseModelJson("I could not read this document.")).toThrow();
  });
});

describe("the parsers that use it", () => {
  it("dispatches actions found in a model's prose", () => {
    const payload = parseDispatchPayload(
      `Reasoning about the order.assistantfinal${ACTIONS}`,
      "document-dispatch",
    );

    expect(payload.actions).toEqual([
      {
        type: "SET_COMMITMENT",
        input: { customer: "Brenner" },
        scope: undefined,
      },
    ]);
  });

  it("still refuses a string with no JSON in it", () => {
    expect(() =>
      parseDispatchPayload("nothing here", "document-dispatch"),
    ).toThrow(/not valid JSON/);
  });

  it("reads a create payload out of prose too", () => {
    const payload = parseCreatePayload(
      'Here you go: {"documentType":"umh/production-ledger","name":"PO-1"}',
      "document-create",
    );

    expect(payload).toMatchObject({
      documentType: "umh/production-ledger",
      name: "PO-1",
    });
  });
});
