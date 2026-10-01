import {
  InvalidAttachmentMetadata,
  validateReserveMetadata,
  type ReserveMetadata,
} from "@powerhousedao/reactor-attachments";
import { describe, expect, it } from "vitest";
import { parseReserveOptions } from "../../src/attachments/routes.js";

type Case = [name: string, meta: Record<string, unknown>];

const base = { mimeType: "text/plain", fileName: "note.txt" };

// The download route's setHeader throws on each of these.
const headerBreaking: Case[] = [
  ["CRLF before a parameter", { ...base, mimeType: "text/plain\r\n;a=b" }],
  ["LF after a ;", { ...base, mimeType: "text/plain;\na=b" }],
  ["a control char quoted", { ...base, mimeType: 'text/plain; a="\x01"' }],
  ["a DEL quoted", { ...base, mimeType: 'text/plain; a="\x7f"' }],
  ["a char above 0xFF quoted", { ...base, mimeType: 'text/plain;a="\u0100"' }],
];

const cases: Case[] = [
  ["plain metadata", base],
  ["an extension", { ...base, extension: "txt" }],
  ["a null extension", { ...base, extension: null }],
  ["a parameter", { ...base, mimeType: "text/plain; charset=utf-8" }],
  ["a quoted parameter", { ...base, mimeType: 'text/plain; a="b c"' }],
  ["a unicode file name", { ...base, fileName: "résumé.pdf" }],
  ["a 255-char mimeType", { ...base, mimeType: `a/${"b".repeat(253)}` }],
  ["a 256-char mimeType", { ...base, mimeType: `a/${"b".repeat(254)}` }],
  ["a 255-char fileName", { ...base, fileName: "f".repeat(255) }],
  ["a 256-char fileName", { ...base, fileName: "f".repeat(256) }],
  ["an empty mimeType", { ...base, mimeType: "" }],
  ["an empty fileName", { ...base, fileName: "" }],
  ["an empty extension", { ...base, extension: "" }],
  ["a mimeType with no slash", { ...base, mimeType: "text" }],
  ["a mimeType with no subtype", { ...base, mimeType: "text/" }],
  ["a mimeType with no type", { ...base, mimeType: "/plain" }],
  ["a mimeType with two slashes", { ...base, mimeType: "text/plain/x" }],
  ["a mimeType with a space", { ...base, mimeType: "text plain" }],
  ["a mimeType with a dangling ;", { ...base, mimeType: "text/plain;" }],
  ["a non-string mimeType", { ...base, mimeType: 5 }],
  ["a trailing CRLF in mimeType", { ...base, mimeType: "text/plain\r\n" }],
  [
    "an injected header in mimeType",
    { ...base, mimeType: "text/plain\nX-Injected: 1" },
  ],
  ["a NUL in mimeType", { ...base, mimeType: "text/pl\x00ain" }],
  ...headerBreaking,
  ["a NUL in fileName", { ...base, fileName: "a\x00b" }],
  ["a LF in fileName", { ...base, fileName: "a\nb" }],
  ["a CR in fileName", { ...base, fileName: "a\rb" }],
  ["a tab in fileName", { ...base, fileName: "a\tb" }],
  ["a DEL in fileName", { ...base, fileName: "a\x7fb" }],
  ["a non-string fileName", { ...base, fileName: null }],
  ["a slash in extension", { ...base, extension: "a/b" }],
  ["a backslash in extension", { ...base, extension: "a\\b" }],
  ["a bare slash extension", { ...base, extension: "/" }],
  ["a non-string extension", { ...base, extension: 5 }],
];

function routeAccepts(meta: Record<string, unknown>): boolean {
  return parseReserveOptions(meta) !== null;
}

function validatorAccepts(meta: Record<string, unknown>): boolean {
  try {
    validateReserveMetadata(meta as ReserveMetadata);
    return true;
  } catch (err) {
    if (err instanceof InvalidAttachmentMetadata) return false;
    throw err;
  }
}

describe("reserve metadata parity between the route and validateReserveMetadata", () => {
  it("covers both accepted and rejected metadata", () => {
    const verdicts = cases.map(([, meta]) => routeAccepts(meta));
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  it.each(cases)("agrees on %s", (_name, meta) => {
    expect(validatorAccepts(meta)).toBe(routeAccepts(meta));
  });
});

describe("header-breaking mimeType values", () => {
  it.each(headerBreaking)("the route rejects %s", (_name, meta) => {
    expect(routeAccepts(meta)).toBe(false);
  });

  it.each(headerBreaking)("the validator rejects %s", (_name, meta) => {
    expect(validatorAccepts(meta)).toBe(false);
  });
});
