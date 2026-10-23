import { describe, expect, it } from "vitest";
import {
  fromPGliteErrorInfo,
  toPGliteErrorInfo,
} from "../../../src/pglite/worker/error-info.js";

function pgError(message: string, fields: Record<string, string>): Error {
  const error = new Error(message);
  Object.assign(error, fields);
  return error;
}

describe("PGlite error info", () => {
  it("round-trips Postgres fields, name, stack and the cause chain", () => {
    const root = pgError("disk full", { code: "53100", severity: "PANIC" });
    const middle = new Error("write failed", { cause: root });
    middle.name = "WriteError";
    const top = pgError("could not commit", {
      code: "25P02",
      severity: "ERROR",
      detail: "d",
      hint: "h",
      position: "3",
      schema: "public",
      table: "t",
      column: "c",
      constraint: "k",
      routine: "r",
    });
    Object.defineProperty(top, "cause", { value: middle });

    const info = structuredClone(toPGliteErrorInfo(top));
    const rebuilt = fromPGliteErrorInfo(info);

    expect(rebuilt).toBeInstanceOf(Error);
    expect(rebuilt.message).toBe("could not commit");
    expect(rebuilt.stack).toBe(top.stack);
    expect(rebuilt).toMatchObject({
      code: "25P02",
      severity: "ERROR",
      detail: "d",
      hint: "h",
      position: "3",
      schema: "public",
      table: "t",
      column: "c",
      constraint: "k",
      routine: "r",
    });
    const cause = rebuilt.cause as Error;
    expect(cause).toBeInstanceOf(Error);
    expect(cause.name).toBe("WriteError");
    expect(cause.message).toBe("write failed");
    expect(cause.cause).toMatchObject({ code: "53100", severity: "PANIC" });
  });

  it("describes non-Error values", () => {
    expect(toPGliteErrorInfo("plain").message).toBe("plain");
    expect(toPGliteErrorInfo({ message: "object" }).message).toBe("object");
    expect(toPGliteErrorInfo(42).message).toBe("42");
  });
});
