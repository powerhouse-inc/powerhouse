import {
  getDateLikeFieldNames,
  getInputFieldNames,
} from "@powerhousedao/codegen";
import type { OperationSpecification } from "@powerhousedao/shared/document-model";
import { makeTestCaseForOperation } from "@powerhousedao/codegen/templates";
import { generateMock } from "document-model";
import { describe, expect, test } from "bun:test";
import { z } from "zod";

// Regression coverage for BUG-codegen-datetime-mock.

const STATE_SDL = `
type InvoiceState {
  id: String!
  dateIssued: Date!
  dateDue: DateTime
  reminders: [DateTime!]!
  title: String
}
`;

const INVOICE_INPUT_SDL =
  "input EditInvoiceInput {\n  dateIssued: String\n  title: String\n}";

function makeOperation(
  overrides: Partial<OperationSpecification> = {},
): OperationSpecification {
  return {
    description: null,
    errors: [],
    examples: [],
    id: "op-1",
    name: "EDIT_INVOICE",
    reducer: null,
    schema: INVOICE_INPUT_SDL,
    template: null,
    scope: "global",
    ...overrides,
  };
}

describe("getDateLikeFieldNames", () => {
  test("collects Date/DateTime fields through NonNull and List wrappers", () => {
    const names = getDateLikeFieldNames(STATE_SDL);
    expect([...names].sort()).toEqual(["dateDue", "dateIssued", "reminders"]);
    expect(names.has("id")).toBe(false);
    expect(names.has("title")).toBe(false);
  });

  test("returns an empty set for null/empty/unparseable input", () => {
    expect(getDateLikeFieldNames(null).size).toBe(0);
    expect(getDateLikeFieldNames("").size).toBe(0);
    expect(getDateLikeFieldNames("type {{{ not valid").size).toBe(0);
  });
});

describe("getInputFieldNames", () => {
  test("returns the input type's field names", () => {
    expect(getInputFieldNames(INVOICE_INPUT_SDL)).toEqual([
      "dateIssued",
      "title",
    ]);
  });

  test("returns an empty array for null/unparseable input", () => {
    expect(getInputFieldNames(null)).toEqual([]);
    expect(getInputFieldNames("not graphql")).toEqual([]);
  });

  test("selects the named input type, not the first (nested input defined first)", () => {
    const sdl = `
      input AssistantContentPartInput { id: OID! url: URL }
      input AddAssistantMessageInput { id: OID! content: String createdAt: DateTime! }
    `;
    // Without the name it would wrongly return the nested input's fields (incl. url).
    expect(getInputFieldNames(sdl, "AddAssistantMessageInput")).toEqual([
      "id",
      "content",
      "createdAt",
    ]);
    expect(getInputFieldNames(sdl, "AddAssistantMessageInput")).not.toContain(
      "url",
    );
  });
});

describe("makeTestCaseForOperation", () => {
  test("emits an ISO datetime override for date-like input fields", () => {
    const code = makeTestCaseForOperation(makeOperation(), "isInvoiceDocument", [
      { name: "dateIssued", literal: '"2024-01-01T00:00:00.000Z"' },
    ]);
    expect(code).toContain('dateIssued: "2024-01-01T00:00:00.000Z"');
    expect(code).toContain("EditInvoiceInputSchema(),");
  });

  test("emits a valid URL override for url-like input fields", () => {
    const code = makeTestCaseForOperation(makeOperation(), "isInvoiceDocument", [
      { name: "icon", literal: '"https://example.com"' },
    ]);
    expect(code).toContain('icon: "https://example.com"');
  });

  test("emits no override (original single-arg call) when there are none", () => {
    const code = makeTestCaseForOperation(
      makeOperation(),
      "isInvoiceDocument",
      [],
    );
    expect(code).not.toContain("2024-01-01T00:00:00.000Z");
    expect(code).toContain("generateMock(");
  });
});

describe("generateMock overrides", () => {
  test("override replaces the generated value and satisfies strict ISO datetime", () => {
    const inputSchema = z.object({
      dateIssued: z.string(),
      title: z.string(),
    });
    const result = generateMock(inputSchema, {
      dateIssued: "2024-01-01T00:00:00.000Z",
    });

    expect(result.dateIssued).toBe("2024-01-01T00:00:00.000Z");
    expect(z.iso.datetime().safeParse(result.dateIssued).success).toBe(true);
    expect(typeof result.title).toBe("string");
  });
});
