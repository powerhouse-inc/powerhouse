import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { FileTooLargeError } from "../../../src/pieces/activepieces/context/limits.js";
import {
  normalizePropsValue,
  normalizeValue,
  toApFile,
  type ApFileValue,
  type ApStreamingFileValue,
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

  // DATE_TIME and JSON drop what they cannot read, and NUMBER yields NaN;
  // validation, not normalisation, reports the unreadable JSON by name.
  it("drops what it cannot read, and an OBJECT that is not an object", async () => {
    const result = await normalizePropsValue(props, {
      count: "twelve",
      payload: "{not json",
      headers: "[1,2]",
      when: "later",
    });
    expect(result).toEqual({ count: NaN });
  });

  it("drops keys that normalise to undefined and skips absent props", async () => {
    const result = await normalizePropsValue(props, { count: "", flag: null });
    expect(result).toEqual({ flag: null });
    expect(await normalizePropsValue(undefined, { a: "1" })).toEqual({
      a: "1",
    });
  });
});

describe("streaming FILE props and size caps", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/known") {
        res.writeHead(200, {
          "content-type": "text/csv",
          "content-length": "6",
        });
        res.end("a,b\n1\n");
        return;
      }
      // No content-length: only counting what arrives can stop it.
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("1234");
      res.write("5678");
      res.end("9012");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    delete process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
    await new Promise((resolve) => server.close(resolve));
  });

  async function text(body: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }

  const streaming: ApProperty = { type: "FILE", streaming: true };

  it("hands a streaming prop a body, not bytes", async () => {
    const fromUri = (await normalizeValue(
      streaming,
      `data:text/csv;base64,${Buffer.from("x,y").toString("base64")}`,
    )) as ApStreamingFileValue;
    expect(fromUri).toMatchObject({
      filename: "file.csv",
      extension: "csv",
      size: 3,
    });
    expect("data" in fromUri).toBe(false);
    expect(await text(fromUri.body)).toBe("x,y");

    const fromUrl = (await normalizeValue(
      streaming,
      `${base}/known`,
    )) as ApStreamingFileValue;
    expect(fromUrl).toMatchObject({ filename: "known", size: 6 });
    expect(await text(fromUrl.body)).toBe("a,b\n1\n");
  });

  it("streams a staged reference from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ap-open-ref-"));
    const path = join(dir, "in-0");
    await writeFile(path, "staged");
    const file = (await normalizeValue(streaming, "attachment://v1:abc", {
      openRef: (ref) => {
        expect(ref).toBe("attachment://v1:abc");
        return Promise.resolve({ path, size: 6, filename: "s.csv" });
      },
    })) as ApStreamingFileValue;
    expect(file).toMatchObject({
      filename: "s.csv",
      extension: "csv",
      size: 6,
    });
    expect(await text(file.body)).toBe("staged");
    await rm(dir, { recursive: true, force: true });
  });

  it("caps a URL body with no declared length as it arrives", async () => {
    process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES = "8";
    try {
      await expect(toApFile(`${base}/chunked`)).rejects.toThrow(
        "exceeds the 8 byte limit",
      );
      const file = (await normalizeValue(
        streaming,
        `${base}/chunked`,
      )) as ApStreamingFileValue;
      await expect(text(file.body)).rejects.toBeInstanceOf(FileTooLargeError);
    } finally {
      delete process.env.PH_WORKFLOWS_PIECE_MAX_FILE_BYTES;
    }
  });

  it("computes base64 only when it is read", async () => {
    const file = (await toApFile(
      `data:text/plain;base64,${Buffer.from("lazy").toString("base64")}`,
    )) as ApFileValue;
    expect(typeof Object.getOwnPropertyDescriptor(file, "base64")?.get).toBe(
      "function",
    );
    expect(file.base64).toBe(Buffer.from("lazy").toString("base64"));
    // Spread and JSON still see it, so a piece copying the value loses nothing.
    expect({ ...file }.base64).toBe(file.base64);
  });
});
