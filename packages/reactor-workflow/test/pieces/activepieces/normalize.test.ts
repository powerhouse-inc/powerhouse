import {
  normalizePropsValue,
  normalizeValue,
  toApFile,
  type ApFileValue,
} from "../../../src/pieces/activepieces/context/normalize.js";
import type { ApProperty } from "../../../src/pieces/activepieces/types.js";

const coerce = (type: string, value: unknown) =>
  normalizeValue({ type }, value);

describe("scalar coercions", () => {
  // NaN for unparseable text, not the original string: the engine's number
  // processor is Number(value), and a piece must not receive a string here.
  it("parses numeric strings", async () => {
    expect(await coerce("NUMBER", "42")).toBe(42);
    expect(await coerce("NUMBER", " 3.5 ")).toBe(3.5);
    expect(await coerce("NUMBER", 7)).toBe(7);
    expect(await coerce("NUMBER", "")).toBeUndefined();
    expect(await coerce("NUMBER", "abc")).toBeNaN();
  });

  // Only JSON's own true/false parse; "False" and "" are not booleans, and an
  // empty checkbox is absent rather than false.
  it("parses boolean strings", async () => {
    expect(await coerce("CHECKBOX", "true")).toBe(true);
    expect(await coerce("CHECKBOX", "False")).toBe("False");
    expect(await coerce("CHECKBOX", "")).toBeUndefined();
    expect(await coerce("CHECKBOX", true)).toBe(true);
    expect(await coerce("CHECKBOX", "yes")).toBe("yes");
  });

  // An empty multi-select is absent rather than the empty list.
  it("turns strings into arrays", async () => {
    expect(await coerce("MULTI_SELECT_DROPDOWN", ["a"])).toEqual(["a"]);
    expect(await coerce("MULTI_SELECT_DROPDOWN", '["a","b"]')).toEqual([
      "a",
      "b",
    ]);
    expect(await coerce("MULTI_SELECT_DROPDOWN", "single")).toEqual(["single"]);
    expect(await coerce("MULTI_SELECT_DROPDOWN", "")).toBeUndefined();
    expect(await coerce("MULTI_SELECT_DROPDOWN", 5)).toEqual([5]);
  });

  // Anything dayjs cannot read is dropped, a number included: a piece reading
  // a DATE_TIME prop is promised an ISO string or nothing.
  it("normalises date-times to ISO and drops what it cannot read", async () => {
    expect(await coerce("DATE_TIME", "2026-09-04T10:00:00.000Z")).toBe(
      "2026-09-04T10:00:00.000Z",
    );
    expect(await coerce("DATE_TIME", "2026-09-04T10:00:00+02:00")).toBe(
      "2026-09-04T08:00:00.000Z",
    );
    expect(await coerce("DATE_TIME", 0)).toBeUndefined();
    expect(await coerce("DATE_TIME", "")).toBeUndefined();
    expect(await coerce("DATE_TIME", "tomorrow-ish")).toBeUndefined();
  });
});

describe("toApFile", () => {
  it("decodes a base64 data URI into an ApFile shape", async () => {
    const file = (await toApFile(
      `data:text/plain;name=hello.txt;base64,${Buffer.from("hi").toString("base64")}`,
    )) as ApFileValue;
    expect(file.filename).toBe("hello.txt");
    expect(file.extension).toBe("txt");
    expect(file.data.toString()).toBe("hi");
    expect(file.base64).toBe(Buffer.from("hi").toString("base64"));
  });

  it("derives a filename from the mime type when the URI has none", async () => {
    const file = (await toApFile(
      `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
    )) as ApFileValue;
    expect(file.filename).toBe("file.png");
    expect(file.extension).toBe("png");
  });

  it("fetches URLs through the injected fetcher", async () => {
    const seen: string[] = [];
    const file = (await toApFile("https://example.test/docs/report.pdf", {
      fetchFile: (url) => {
        seen.push(url);
        return Promise.resolve({
          data: Buffer.from("%PDF"),
          contentType: "application/pdf",
        });
      },
    })) as ApFileValue;
    expect(seen).toEqual(["https://example.test/docs/report.pdf"]);
    expect(file.filename).toBe("file.pdf");
    expect(file.data.toString()).toBe("%PDF");
  });

  it("completes an already file-shaped value and passes other text through", async () => {
    const shaped = (await toApFile({
      filename: "a.csv",
      base64: Buffer.from("x,y").toString("base64"),
    })) as ApFileValue;
    expect(shaped.extension).toBe("csv");
    expect(shaped.data.toString()).toBe("x,y");
    expect(await toApFile("not a file")).toBe("not a file");
    expect(await toApFile("")).toBeUndefined();
  });
});

describe("normalizePropsValue", () => {
  const props: Record<string, ApProperty> = {
    count: { type: "NUMBER" },
    flag: { type: "CHECKBOX" },
    payload: { type: "JSON" },
    headers: { type: "OBJECT" },
    when: { type: "DATE_TIME" },
    picks: { type: "MULTI_SELECT_DROPDOWN" },
    rows: {
      type: "ARRAY",
      properties: { qty: { type: "NUMBER" }, label: { type: "SHORT_TEXT" } },
    },
    plain: { type: "ARRAY" },
    text: { type: "SHORT_TEXT" },
  };

  it("coerces each configured value by its prop type", async () => {
    const result = await normalizePropsValue(props, {
      count: "12",
      flag: "true",
      payload: '{"a":1}',
      headers: '{"x-id":"1"}',
      when: "2026-01-02T03:04:05Z",
      picks: '["a","b"]',
      rows: [{ qty: "2", label: "two" }, "loose"],
      plain: "one",
      text: "42",
      extra: "kept",
    });
    // `plain` is an ARRAY with no item schema, which the engine leaves alone.
    expect(result).toEqual({
      count: 12,
      flag: true,
      payload: { a: 1 },
      headers: { "x-id": "1" },
      when: "2026-01-02T03:04:05.000Z",
      picks: ["a", "b"],
      rows: [{ qty: 2, label: "two" }, "loose"],
      plain: "one",
      text: "42",
      extra: "kept",
    });
  });

  // A value the coercion cannot read does not reach the piece as its raw text:
  // JSON and DATE_TIME drop it, NUMBER yields NaN, OBJECT parses any JSON.
  it("refuses values the coercion cannot read", async () => {
    const result = await normalizePropsValue(props, {
      count: "twelve",
      payload: "{not json",
      headers: "[1,2]",
      when: "later",
    });
    expect(result).toEqual({ count: NaN, headers: [1, 2] });
  });

  it("drops keys that normalise to undefined and skips absent props", async () => {
    const result = await normalizePropsValue(props, { count: "", flag: null });
    expect(result).toEqual({ flag: null });
    expect(await normalizePropsValue(undefined, { a: "1" })).toEqual({
      a: "1",
    });
  });
});
