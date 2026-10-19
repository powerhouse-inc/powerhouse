import { describe, expect, it } from "vitest";
import { documentOptions, type DriveLike } from "./document-options.js";

const drive = (
  id: string,
  name: string,
  nodes: DriveLike["state"]["global"]["nodes"],
) => ({ header: { id }, state: { global: { name, nodes } } }) as DriveLike;

describe("documentOptions", () => {
  it("lists the files in every drive once, by name", () => {
    const invoice = {
      id: "f1",
      name: "Invoice 1",
      kind: "file",
      documentType: "x/invoice",
    };
    const drives = [
      drive("d2", "Ledgers", [
        invoice,
        { id: "folder", name: "2026", kind: "folder" },
      ]),
      drive("d1", "Archive", [invoice]),
    ];
    expect(documentOptions(drives)).toEqual([
      { value: "f1", label: "Invoice 1", description: "x/invoice · Ledgers" },
    ]);
  });
});
