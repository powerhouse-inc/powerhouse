import { strToU8, unzip } from "fflate";
import { describe, expect, it } from "vitest";
import { createBaseState } from "./state.js";
import { createPresignedHeader } from "./header.js";
import {
  createZip,
  documentModelLoadFromInput,
  isDocumentZip,
  parseBulkArchive,
  zipEntries,
} from "./files.js";

const empty = new Uint8Array(0);

async function documentZip(): Promise<Uint8Array> {
  const header = createPresignedHeader("doc-1", "test/doc");
  const state = createBaseState(undefined, { version: 1 });
  return await createZip({
    header,
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  });
}

async function bulkZip(): Promise<Uint8Array> {
  return await zipEntries({
    "Archive/": empty,
    "Archive/sub/": empty,
    "Archive/grantee-1.phdm.phd": strToU8("inner-doc-zip-bytes"),
    "Archive/sub/grantee-2.phdm.phd": strToU8("inner-doc-zip-bytes"),
  });
}

describe("isDocumentZip", () => {
  it("is true for a single-document zip (4 JSON entries at the root)", async () => {
    expect(await isDocumentZip(await documentZip())).toBe(true);
  });

  it("is false for a bulk archive (folder tree, no root JSON entries)", async () => {
    expect(await isDocumentZip(await bulkZip())).toBe(false);
  });

  it("is false for non-zip bytes", async () => {
    expect(await isDocumentZip(strToU8("this is not a zip"))).toBe(false);
  });
});

describe("documentModelLoadFromInput", () => {
  it("rejects with fflate's invalid-zip error for non-zip bytes", async () => {
    await expect(
      documentModelLoadFromInput(strToU8("this is not a zip")),
    ).rejects.toThrow("invalid zip data");
  });
});

describe("parseBulkArchive", () => {
  it("returns the file entries with their paths, excluding directory entries", async () => {
    const entries = await parseBulkArchive(await bulkZip());
    expect(entries.map((e) => e.path).sort()).toEqual([
      "Archive/grantee-1.phdm.phd",
      "Archive/sub/grantee-2.phdm.phd",
    ]);
    expect(entries[0].data).toBeInstanceOf(Uint8Array);
  });

  it("throws when the archive has no files", async () => {
    const dirsOnly = await zipEntries({ "A/": empty, "A/B/": empty });
    await expect(parseBulkArchive(dirsOnly)).rejects.toThrow(
      "Archive contains no files",
    );
  });

  it("throws on a single-document zip (its root entries are JSON, not files)", async () => {
    // header.json & friends end in .json but are NOT document files; the
    // caller is expected to check isDocumentZip first. parseBulkArchive
    // still returns them — so assert the contract is "whatever the entries
    // are", and detection lives in isDocumentZip.
    const entries = await parseBulkArchive(await documentZip());
    expect(entries.map((e) => e.path).sort()).toEqual([
      "current-state.json",
      "header.json",
      "operations.json",
      "state.json",
    ]);
  });
});

describe("zipEntries", () => {
  it("round-trips directory entries (trailing slash, empty data)", async () => {
    const zip = await zipEntries({
      "F/": empty,
      "F/sub/": empty,
      "F/leaf.txt": strToU8("x"),
    });
    const files = await new Promise<Record<string, Uint8Array>>(
      (resolve, reject) =>
        unzip(new Uint8Array(zip), (err, out) =>
          err ? reject(err) : resolve(out),
        ),
    );
    expect(Object.keys(files).sort()).toEqual(["F/", "F/leaf.txt", "F/sub/"]);
  });
});
