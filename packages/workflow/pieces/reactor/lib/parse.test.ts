// What a model actually says, and what the piece is prepared to read out of it.
import { describe, expect, it } from "vitest";
import {
  ConfigReader,
  parseActionInput,
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

const exact = () => ConfigReader.of("document-dispatch", undefined);
const extract = () => ConfigReader.of("document-dispatch", "extract");
const ID = "01234567-89ab-cdef-0123-456789abcdef";

describe("the parse option", () => {
  it("defaults to exact and rejects an unknown mode", () => {
    expect(exact().mode).toBe("exact");
    expect(() => ConfigReader.of("document-get", "lenient")).toThrow(
      /"parse" must be/,
    );
  });
});

describe("document ids", () => {
  it("takes an exact id as given", () => {
    const reader = exact();
    expect(reader.documentId(ID, "documentId")).toBe(ID);
    expect(reader.documentId("my-slug", "documentId")).toBe("my-slug");
    expect(reader.output()).toEqual({});
  });

  it("refuses an id inside text unless asked to extract", () => {
    // The first uuid of "Merge A into B" is not a safe target.
    expect(() =>
      exact().documentId(`Merge ${ID} into the other`, "documentId"),
    ).toThrow(/not a document id.*Extract from AI output/);
    expect(() => exact().documentId(`"${ID}"`, "documentId")).toThrow();
    expect(() => exact().documentId(42, "documentId")).toThrow(
      /must be a document id/,
    );
  });

  it("extracts one on request and says what it read from", () => {
    const reader = extract();
    const text = `The document is "${ID}".`;
    expect(reader.documentId(text, "documentId")).toBe(ID);
    expect(reader.output()).toEqual({ extractedFrom: { documentId: text } });
  });

  it("extracts a derived id", () => {
    const derived = "taZIv6HFu5vxqH3YvrZ6W6N3Dg6qlS87HI628RCVicg";
    expect(
      extract().documentId(`Use ${derived}, not the other.`, "documentId"),
    ).toBe(derived);
  });
});

describe("dispatch payloads", () => {
  it("reads an exact JSON list or {documentId, actions}", () => {
    expect(parseDispatchPayload(ACTIONS, exact()).actions).toEqual([
      {
        type: "SET_COMMITMENT",
        input: { customer: "Brenner" },
        scope: undefined,
      },
    ]);
    expect(
      parseDispatchPayload({ documentId: ID, actions: [] }, exact()),
    ).toEqual({ documentId: ID, actions: [] });
    expect(parseDispatchPayload(undefined, exact())).toEqual({ actions: [] });
  });

  it("refuses prose, fences and a lone action object in exact mode", () => {
    expect(() =>
      parseDispatchPayload(`Reasoning.assistantfinal${ACTIONS}`, exact()),
    ).toThrow(/not valid JSON/);
    expect(() =>
      parseDispatchPayload("```json\n" + ACTIONS + "\n```", exact()),
    ).toThrow(/not valid JSON/);
    expect(() =>
      parseDispatchPayload({ type: "SET_NAME", input: {} }, exact()),
    ).toThrow(/must be a list of actions/);
  });

  it("refuses a payload that is neither a list nor an object, in both modes", () => {
    for (const reader of [exact(), extract()]) {
      expect(() => parseDispatchPayload("42", reader)).toThrow(
        /must be a list of actions/,
      );
      expect(() => parseDispatchPayload(true, reader)).toThrow(
        /must be a list of actions/,
      );
    }
  });

  it("extracts actions out of a model's prose on request", () => {
    const reader = extract();
    const text = `Reasoning about the order.assistantfinal${ACTIONS}`;
    const payload = parseDispatchPayload(text, reader);

    expect(payload.actions).toEqual([
      {
        type: "SET_COMMITMENT",
        input: { customer: "Brenner" },
        scope: undefined,
      },
    ]);
    expect(reader.output()).toEqual({ extractedFrom: { actions: text } });
  });

  it("still refuses a string with no JSON in it when extracting", () => {
    expect(() => parseDispatchPayload("nothing here", extract())).toThrow(
      /holds no JSON/,
    );
  });

  it("holds a payload's own documentId to the same mode", () => {
    expect(() =>
      parseDispatchPayload({ documentId: `it is ${ID}`, actions: [] }, exact()),
    ).toThrow(/actions.documentId/);
  });
});

describe("create payloads and action input", () => {
  it("reads an exact create payload and rejects a non-object", () => {
    const reader = ConfigReader.of("document-create", "exact");
    expect(
      parseCreatePayload('{"documentType":"a/b","name":"PO-1"}', reader),
    ).toMatchObject({ documentType: "a/b", name: "PO-1" });
    expect(() => parseCreatePayload("[1]", reader)).toThrow(
      /must be an object/,
    );
    expect(() => parseCreatePayload({ documentType: 3 }, reader)).toThrow(
      /payload.documentType/,
    );
  });

  it("reads a create payload out of prose when extracting", () => {
    const reader = ConfigReader.of("document-create", "extract");
    const payload = parseCreatePayload(
      'Here you go: {"documentType":"umh/production-ledger","name":"PO-1"}',
      reader,
    );

    expect(payload).toMatchObject({
      documentType: "umh/production-ledger",
      name: "PO-1",
    });
    expect(reader.output().extractedFrom).toHaveProperty("payload");
  });

  it("rejects an input that is not an object instead of sending {}", () => {
    expect(parseActionInput(undefined, exact())).toEqual({});
    expect(parseActionInput('{"name":"x"}', exact())).toEqual({ name: "x" });
    expect(() => parseActionInput('"x"', exact())).toThrow(
      /"input" must be an object/,
    );
    expect(() => parseActionInput("Name it x", exact())).toThrow(
      /not valid JSON/,
    );
  });
});
