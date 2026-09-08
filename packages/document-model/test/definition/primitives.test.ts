import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  canonicalJsonFromUnknown,
  cloneJson,
  compareCodeUnits,
  deriveDefinitionId,
  isGraphQLName,
  sha256,
  uuidV5,
} from "../../src/definition/primitives.js";
import {
  deriveDocumentModelModuleNames,
  deriveDocumentModelNames,
  deriveDocumentModelOperationNames,
} from "../../src/definition/naming.js";

describe("definition primitives", () => {
  it("recognizes author-defined GraphQL names and rejects reserved introspection names", () => {
    expect(isGraphQLName("Record_2")).toBe(true);
    expect(isGraphQLName("__proto__")).toBe(false);
    expect(isGraphQLName("__typename")).toBe(false);
  });

  it("encodes canonical JSON with UTF-16 code-unit key ordering", () => {
    expect(
      canonicalJson({ z: 1, a: [true, null], nested: { b: 2, a: 1 } }),
    ).toBe('{"a":[true,null],"nested":{"a":1,"b":2},"z":1}');
    expect(compareCodeUnits("😀", "\uE000")).toBeLessThan(0);
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(
      "finite JSON number",
    );
    expect(sha256("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256("a".repeat(55))).toBe(
      "sha256:9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
    );
    expect(sha256("a".repeat(56))).toBe(
      "sha256:b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
    );
    expect(sha256("a".repeat(64))).toBe(
      "sha256:ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
    );
  });

  it("canonicalizes untyped JSON boundaries without duplicating encoders", () => {
    const sparse: unknown[] = [1, undefined, null, null];
    Reflect.deleteProperty(sparse, "2");
    expect(canonicalJsonFromUnknown(undefined)).toBe("null");
    expect(
      canonicalJsonFromUnknown({
        z: undefined,
        b: sparse,
        a: { value: true },
      }),
    ).toBe('{"a":{"value":true},"b":[1,null,null,null]}');
    expect(() => canonicalJsonFromUnknown({ value: 1n })).toThrow(
      "JSON-compatible",
    );
    expect(() => canonicalJsonFromUnknown({ value: () => undefined })).toThrow(
      "JSON-compatible",
    );
    expect(() => canonicalJsonFromUnknown([Symbol("value")])).toThrow(
      "JSON-compatible",
    );
    expect(() => canonicalJsonFromUnknown(new Date(0))).toThrow(
      "plain JSON object",
    );
    expect(() =>
      canonicalJsonFromUnknown({ [Symbol("hidden")]: true }),
    ).toThrow("symbol keys");
    const hidden = {};
    Object.defineProperty(hidden, "value", { value: true });
    expect(() => canonicalJsonFromUnknown(hidden)).toThrow(
      "enumerable data property",
    );
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return getterCalls;
      },
    });
    expect(() => canonicalJsonFromUnknown(accessor)).toThrow(
      "enumerable data property",
    );
    expect(() => canonicalJson(accessor as never)).toThrow(
      "enumerable data property",
    );
    expect(() => cloneJson(accessor as never)).toThrow(
      "enumerable data property",
    );
    expect(getterCalls).toBe(0);
    const decoratedArray: unknown[] = [];
    Object.defineProperty(decoratedArray, "extra", {
      enumerable: true,
      value: true,
    });
    expect(() => canonicalJsonFromUnknown(decoratedArray)).toThrow(
      "non-index array properties",
    );
    const withToJson = { value: true, toJSON: () => ({ value: false }) };
    expect(() => cloneJson(withToJson as never)).toThrow("JSON value");
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJsonFromUnknown(cyclic)).toThrow("cycle");
  });

  it("matches the frozen UUIDv5 identity vectors", () => {
    expect(
      uuidV5("www.widgets.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    ).toBe("21f7f8de-8051-5b89-8680-0195ef798b6a");
    expect(
      deriveDefinitionId("powerhouse/invoice", "module", "lineItems"),
    ).toBe("4c323bb9-fd39-5600-9af2-bc0c28489e37");
    expect(
      deriveDefinitionId(
        "powerhouse/invoice",
        "operation",
        "lineItems",
        "addLineItem",
      ),
    ).toBe("f9ba524d-2a61-53f3-bbd9-452ed03b7523");
    expect(() =>
      deriveDefinitionId("powerhouse/invoice", "module", "e\u0301"),
    ).toThrow("Unicode NFC");
    expect(() => uuidV5("name", "f80a5a40200a5996b2af2c0996a4135e")).toThrow(
      "canonical 16-byte UUID",
    );
    expect(() =>
      uuidV5("name", "f80a5a40-200a5996-b2af-2c09-96a4135e"),
    ).toThrow("canonical 16-byte UUID");
  });

  it("derives every compatibility-sensitive name in one module", () => {
    expect(deriveDocumentModelNames("invoice ledger")).toEqual({
      graphQLName: "InvoiceLedger",
      globalStateName: "InvoiceLedgerState",
      localStateName: "InvoiceLedgerLocalState",
      valueName: "invoiceLedger",
    });
    expect(
      deriveDocumentModelOperationNames("add-line_item", { hasInput: true }),
    ).toEqual({
      actionCreatorKey: "addLineItem",
      actionInputSchemaName: "AddLineItemInputSchema",
      actionInputTypeName: "AddLineItemInput",
      actionType: "ADD_LINE_ITEM",
      actionTypeName: "AddLineItemAction",
      reducerMethod: "addLineItemOperation",
      storedName: "AddLineItem",
    });
    expect(deriveDocumentModelModuleNames("invoice", "line items")).toEqual({
      actionTypeName: "InvoiceLineItemsAction",
      directoryName: "line-items",
      moduleNamespace: "invoiceLineItemsActions",
      operationsInterfaceName: "InvoiceLineItemsOperations",
      operationsValueName: "invoiceLineItemsOperations",
      storedName: "LineItems",
    });
  });
});
