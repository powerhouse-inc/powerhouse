import {
  normalizePropsValue,
  toApFile,
  toArray,
  toBoolean,
  toIsoDateTime,
  toNumber,
  type ApFileValue,
} from "../../../src/pieces/activepieces/context/normalize.js";
import type { ApProperty } from "../../../src/pieces/activepieces/types.js";

describe("scalar coercions", () => {
  it("parses numeric strings and keeps everything else", () => {
    expect(toNumber("42")).toBe(42);
    expect(toNumber(" 3.5 ")).toBe(3.5);
    expect(toNumber(7)).toBe(7);
    expect(toNumber("")).toBeUndefined();
    expect(toNumber("abc")).toBe("abc");
  });

  it("parses boolean strings", () => {
    expect(toBoolean("true")).toBe(true);
    expect(toBoolean("False")).toBe(false);
    expect(toBoolean("")).toBe(false);
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean("yes")).toBe("yes");
  });

  it("turns strings into arrays", () => {
    expect(toArray(["a"])).toEqual(["a"]);
    expect(toArray('["a","b"]')).toEqual(["a", "b"]);
    expect(toArray("single")).toEqual(["single"]);
    expect(toArray("")).toEqual([]);
    expect(toArray(5)).toEqual([5]);
  });

  it("normalises date-times to ISO and keeps unparseable text", () => {
    expect(toIsoDateTime("2026-09-04T10:00:00.000Z")).toBe(
      "2026-09-04T10:00:00.000Z",
    );
    expect(toIsoDateTime("2026-09-04T10:00:00+02:00")).toBe(
      "2026-09-04T08:00:00.000Z",
    );
    expect(toIsoDateTime(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(toIsoDateTime("")).toBeUndefined();
    expect(toIsoDateTime("tomorrow-ish")).toBe("tomorrow-ish");
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
    expect(result).toEqual({
      count: 12,
      flag: true,
      payload: { a: 1 },
      headers: { "x-id": "1" },
      when: "2026-01-02T03:04:05.000Z",
      picks: ["a", "b"],
      rows: [{ qty: 2, label: "two" }, "loose"],
      plain: ["one"],
      text: "42",
      extra: "kept",
    });
  });

  it("keeps values the coercion cannot improve", async () => {
    const result = await normalizePropsValue(props, {
      count: "twelve",
      payload: "{not json",
      headers: "[1,2]",
      when: "later",
    });
    expect(result).toEqual({
      count: "twelve",
      payload: "{not json",
      headers: "[1,2]",
      when: "later",
    });
  });

  it("drops keys that normalise to undefined and skips absent props", async () => {
    const result = await normalizePropsValue(props, { count: "", flag: null });
    expect(result).toEqual({ flag: null });
    expect(await normalizePropsValue(undefined, { a: "1" })).toEqual({
      a: "1",
    });
  });
});
