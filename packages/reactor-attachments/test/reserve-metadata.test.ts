import { validateHeaderValue } from "node:http";
import { describe, expect, it } from "vitest";
import { InvalidAttachmentMetadata } from "../src/errors.js";
import {
  validateReserveMetadata,
  type ReserveMetadata,
} from "../src/reserve-metadata.js";

const VALID: ReserveMetadata = {
  mimeType: "text/plain",
  fileName: "notes.txt",
  extension: "txt",
};

function check(overrides: Record<string, unknown>): void {
  validateReserveMetadata({ ...VALID, ...overrides } as ReserveMetadata);
}

function accepts(mimeType: string): boolean {
  try {
    check({ mimeType });
    return true;
  } catch (err) {
    if (err instanceof InvalidAttachmentMetadata) return false;
    throw err;
  }
}

function isValidHeader(value: string): boolean {
  try {
    validateHeaderValue("Content-Type", value);
    return true;
  } catch {
    return false;
  }
}

function rejects(
  overrides: Record<string, unknown>,
  field: InvalidAttachmentMetadata["field"],
): void {
  let thrown: unknown;
  try {
    check(overrides);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(InvalidAttachmentMetadata);
  expect((thrown as InvalidAttachmentMetadata).field).toBe(field);
}

describe("validateReserveMetadata", () => {
  it("accepts valid metadata", () => {
    expect(() => check({})).not.toThrow();
  });

  describe("mimeType", () => {
    it("rejects a non-string", () => {
      rejects({ mimeType: 42 }, "mimeType");
      rejects({ mimeType: undefined }, "mimeType");
    });

    it("rejects an empty string", () => {
      rejects({ mimeType: "" }, "mimeType");
    });

    it("accepts 255 characters and rejects 256", () => {
      const at = (n: number) => `a/${"b".repeat(n - 2)}`;
      expect(() => check({ mimeType: at(255) })).not.toThrow();
      rejects({ mimeType: at(256) }, "mimeType");
    });

    it("accepts token and quoted-string parameters", () => {
      expect(() =>
        check({ mimeType: "text/plain; charset=utf-8" }),
      ).not.toThrow();
      expect(() =>
        check({ mimeType: 'text/plain;name="a \\" b"' }),
      ).not.toThrow();
    });

    it("rejects a value without a subtype", () => {
      rejects({ mimeType: "text" }, "mimeType");
      rejects({ mimeType: "text/" }, "mimeType");
    });

    it("rejects CR and LF", () => {
      rejects({ mimeType: "text/plain\r\nX-Injected: 1" }, "mimeType");
      rejects({ mimeType: 'text/plain; a="b\nc"' }, "mimeType");
    });

    it("rejects values a Content-Type header cannot carry", () => {
      rejects({ mimeType: "text/plain\r\n;a=b" }, "mimeType");
      rejects({ mimeType: "text/plain;\na=b" }, "mimeType");
      rejects({ mimeType: 'text/plain; a="\x01"' }, "mimeType");
      rejects({ mimeType: 'text/plain; a="\x7f"' }, "mimeType");
      rejects({ mimeType: 'text/plain;a="\u0100"' }, "mimeType");
    });

    it("accepts only values that are valid header content", () => {
      for (let code = 0; code <= 0x1ff; code++) {
        const c = String.fromCharCode(code);
        for (const value of [
          `text/plain; a="${c}"`,
          `text/plain; a=${c}`,
          `text/plain${c};a=b`,
          `text/plain;${c}a=b`,
          `text/pl${c}ain`,
        ]) {
          if (accepts(value)) expect(isValidHeader(value), value).toBe(true);
        }
      }
    });

    it("accepts typical values, each a valid header", () => {
      for (const value of [
        "text/plain",
        "text/plain; charset=utf-8",
        "text/plain;\tcharset=utf-8",
        'text/plain; a="b c"',
        'text/plain;name="a \\" b"',
        'text/plain; a="\u00e9"',
        "application/vnd.api+json",
      ]) {
        expect(accepts(value), value).toBe(true);
        expect(isValidHeader(value), value).toBe(true);
      }
    });

    it("rejects a malformed parameter", () => {
      rejects({ mimeType: "text/plain; charset" }, "mimeType");
      rejects({ mimeType: 'text/plain; a="unterminated' }, "mimeType");
    });
  });

  describe("fileName", () => {
    it("rejects a non-string", () => {
      rejects({ fileName: null }, "fileName");
    });

    it("rejects an empty string", () => {
      rejects({ fileName: "" }, "fileName");
    });

    it("accepts 255 characters and rejects 256", () => {
      expect(() => check({ fileName: "f".repeat(255) })).not.toThrow();
      rejects({ fileName: "f".repeat(256) }, "fileName");
    });

    it("rejects control characters at both ends of the range and DEL", () => {
      rejects({ fileName: "a\x00b" }, "fileName");
      rejects({ fileName: "a\x1fb" }, "fileName");
      rejects({ fileName: "a\x7fb" }, "fileName");
    });

    it("accepts the first printable character and non-ASCII", () => {
      expect(() => check({ fileName: "a\x20b" })).not.toThrow();
      expect(() => check({ fileName: "résumé.pdf" })).not.toThrow();
    });
  });

  describe("extension", () => {
    it("accepts absent, undefined and null", () => {
      const { extension: _omit, ...withoutExtension } = VALID;
      expect(() => validateReserveMetadata(withoutExtension)).not.toThrow();
      expect(() => check({ extension: undefined })).not.toThrow();
      expect(() => check({ extension: null })).not.toThrow();
    });

    it("rejects an empty string and accepts one character", () => {
      rejects({ extension: "" }, "extension");
      expect(() => check({ extension: "x" })).not.toThrow();
    });

    it("rejects forward and back slashes", () => {
      rejects({ extension: "a/b" }, "extension");
      rejects({ extension: "a\\b" }, "extension");
    });

    it("rejects a non-string", () => {
      rejects({ extension: 1 }, "extension");
    });
  });

  it("names the first failing field", () => {
    rejects({ mimeType: "", fileName: "", extension: "" }, "mimeType");
    rejects({ fileName: "", extension: "" }, "fileName");
  });
});
