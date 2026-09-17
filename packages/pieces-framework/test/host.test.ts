import { describe, expect, it } from "vitest";
import {
  arrayZipperProcessor,
  formatPieceError,
  processors,
  ssrfIpClassifier,
} from "../src/host.js";
import type { PieceProperty } from "../src/index.js";
import { ApFile, Property, PropertyType } from "../src/index.js";

const DATA_URI = "data:text/plain;base64,aGVsbG8=";

function coerce(type: PropertyType, property: PieceProperty, value: unknown) {
  const processor = processors[type];
  expect(processor).toBeTypeOf("function");
  return processor!(property, value) as unknown;
}

describe("processors", () => {
  it("coerces a NUMBER from its string form", () => {
    const property = Property.Number({ displayName: "N", required: true });
    expect(coerce(PropertyType.NUMBER, property, "42")).toBe(42);
    expect(coerce(PropertyType.NUMBER, property, "")).toBeUndefined();
  });

  it("coerces a CHECKBOX from its string form", () => {
    const property = Property.Checkbox({ displayName: "C", required: false });
    expect(coerce(PropertyType.CHECKBOX, property, "true")).toBe(true);
    expect(coerce(PropertyType.CHECKBOX, property, "false")).toBe(false);
  });

  it("normalises a DATE_TIME to an ISO string in UTC", () => {
    const property = Property.DateTime({ displayName: "D", required: true });
    expect(
      coerce(PropertyType.DATE_TIME, property, "2024-03-14T12:00:00Z"),
    ).toBe("2024-03-14T12:00:00.000Z");
    expect(
      coerce(PropertyType.DATE_TIME, property, "nonsense"),
    ).toBeUndefined();
  });

  it("parses JSON out of a string", () => {
    const property = Property.Json({ displayName: "J", required: true });
    expect(coerce(PropertyType.JSON, property, '{"a":[1,2]}')).toEqual({
      a: [1, 2],
    });
    expect(coerce(PropertyType.JSON, property, "{")).toBeUndefined();
  });

  it("zips an object of parallel arrays into ARRAY items", () => {
    const property = Property.Array({ displayName: "A", required: true });
    expect(
      arrayZipperProcessor(property, { name: ["a", "b"], kind: "static" }),
    ).toEqual([
      { name: "a", kind: "static" },
      { name: "b", kind: "static" },
    ]);
  });

  it("wraps a MULTI_SELECT_DROPDOWN value in an array", () => {
    const property = Property.MultiSelectDropdown({
      displayName: "M",
      required: false,
      auth: undefined,
      refreshers: [],
      options: () => Promise.resolve({ options: [] }),
    });
    expect(
      coerce(PropertyType.MULTI_SELECT_DROPDOWN, property, '["a","b"]'),
    ).toEqual(["a", "b"]);
    expect(coerce(PropertyType.MULTI_SELECT_DROPDOWN, property, "a")).toEqual([
      "a",
    ]);
  });

  it("reads a FILE out of a data URI", async () => {
    const property = Property.File({ displayName: "F", required: true });
    const file = (await coerce(
      PropertyType.FILE,
      property,
      DATA_URI,
    )) as ApFile;
    expect(file).toBeInstanceOf(ApFile);
    expect(file.filename).toBe("unknown.txt");
    expect(file.extension).toBe("txt");
    expect(file.data.toString()).toBe("hello");
  });
});

describe("ssrfIpClassifier", () => {
  it("blocks a private address and allows a public one", () => {
    expect(
      ssrfIpClassifier.isBlockedIp({ ip: "10.0.0.1", allowList: [] }),
    ).toBe(true);
    expect(
      ssrfIpClassifier.isBlockedIp({ ip: "93.184.216.34", allowList: [] }),
    ).toBe(false);
  });

  it("honours an allow list entry given as a CIDR", () => {
    expect(
      ssrfIpClassifier.isBlockedIp({
        ip: "10.0.0.1",
        allowList: ["10.0.0.0/8"],
      }),
    ).toBe(false);
  });
});

describe("formatPieceError", () => {
  it("lifts the API message out of an HTTP-shaped error", () => {
    const formatted = formatPieceError({
      name: "HttpError",
      message: "Request failed with status code 404",
      response: {
        status: 404,
        body: { message: "Board not found" },
      },
      request: { url: "https://api.example.com/boards/1", method: "GET" },
    });
    expect(formatted.message).toBe("Board not found");
    expect(formatted.status).toBe(404);
    expect(formatted.errorName).toBe("HttpError");
    expect(formatted.requestUrl).toBe("https://api.example.com/boards/1");
  });

  it("strips an HTML error page down to its text", () => {
    const formatted = formatPieceError({
      status: 502,
      error:
        "<html><title>Bad Gateway</title><body>upstream is down</body></html>",
    });
    expect(formatted.status).toBe(502);
    expect(formatted.message).toContain("Bad Gateway");
    expect(formatted.message).toContain("upstream is down");
  });
});
