export type CatalogScalarCases = { accepts: unknown[]; rejects: unknown[] };
const nonStrings = [0, false, null, {}, [], undefined];
const plainString: CatalogScalarCases = {
  accepts: ["", "value"],
  rejects: nonStrings,
};
const numbers: CatalogScalarCases = {
  accepts: [0, -1, 1.25],
  rejects: ["1", null, undefined, NaN, Infinity, -Infinity, {}],
};
const datetime: CatalogScalarCases = {
  accepts: ["2024-01-01T00:00:00.000Z"],
  rejects: ["2024-01-01", "invalid", ...nonStrings],
};
const universal: CatalogScalarCases = {
  accepts: [
    null,
    undefined,
    1n,
    Symbol("value"),
    new Date(0),
    new Map(),
    () => 1,
    [],
    { nested: undefined },
  ],
  rejects: [],
};
const address = `eip155:0x${"a".repeat(40)}`;
const attachment = `attachment://v1:${"a".repeat(64)}`;
/** Values each catalog scalar accepts and refuses, keyed by scalar name in catalog order. */
export const catalogScalarCases: Readonly<Record<string, CatalogScalarCases>> =
  {
    Unknown: universal,
    DateTime: datetime,
    Address: {
      accepts: [address, [address], { toString: () => address }],
      rejects: ["0x123", "eip-155:0x" + "a".repeat(40), null, {}, []],
    },
    AttachmentRef: {
      accepts: [
        attachment,
        "attachment://v2:anything",
        [attachment],
        { toString: () => attachment },
      ],
      rejects: ["attachment://v1:", "file://a", null, {}, []],
    },
    Amount_Tokens: numbers,
    EthereumAddress: {
      accepts: [`0x${"a".repeat(40)}`],
      rejects: ["0x123", address, ...nonStrings],
    },
    EmailAddress: {
      accepts: ["a@example.com"],
      rejects: ["email", ...nonStrings],
    },
    Amount_Percentage: numbers,
    Date: datetime,
    URL: {
      accepts: ["https://example.com", "mailto:a@example.com"],
      rejects: ["example", ...nonStrings],
    },
    Amount_Money: numbers,
    OLabel: plainString,
    Currency: plainString,
    PHID: plainString,
    OID: plainString,
    Amount_Fiat: {
      accepts: [
        { unit: "", value: 0 },
        { unit: "USD", value: 1.25, extra: true },
      ],
      rejects: [
        { value: 1 },
        { unit: "USD" },
        { unit: "USD", value: "1" },
        { unit: "USD", value: Infinity },
        null,
      ],
    },
    Amount_Currency: {
      accepts: [
        { unit: "", value: "" },
        { unit: "USD", value: "anything" },
      ],
      rejects: [{ unit: "USD", value: 1 }, {}, null],
    },
    Amount_Crypto: {
      accepts: [
        { unit: "", value: "" },
        { unit: "ETH", value: "anything" },
      ],
      rejects: [{ unit: "ETH", value: 1 }, {}, null],
    },
    Amount: {
      accepts: [{ value: 0 }, { unit: "USD", value: 1.25 }],
      rejects: [{}, { unit: "USD" }, { value: Infinity }, { value: "1" }, null],
    },
    Upload: universal,
  };
