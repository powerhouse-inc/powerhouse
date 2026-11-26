import { describe, expect, it } from "vitest";
import {
  describeUnsignedWriteCaller,
  phMutateFix,
  UNSIGNED_WRITE_CASES,
  UNSIGNED_WRITE_ERROR_CODE,
  UNSIGNED_WRITE_REASONS,
  unsignedWriteExtensions,
  unsignedWriteMessage,
} from "./unsigned-writes.js";

describe("unsigned writes", () => {
  it("names cause, caller and fix for a host-built write", () => {
    expect(
      unsignedWriteMessage({
        reason: "host-built",
        field: "Mutation.renameDocument",
        caller: null,
        actions: ["SET_NAME"],
      }),
    ).toBe(
      "Refused: this host signs no writes for its callers (Powerhouse 6.4). `Mutation.renameDocument` from an anonymous caller asks the host to build and sign SET_NAME. Sign it as yourself: a Powerhouse client (reactor-browser, clint, `ph mcp`) does it for you, or run `ph mutate <document> SET_NAME --input '<json>'`, or send a host session token (`Authorization: Bearer phs_...`, from this host's OAuth device grant at `/oauth`).",
    );
  });

  it("names a host session token as a fix for HTTP /mcp's writes", () => {
    expect(
      unsignedWriteMessage({
        reason: "mcp-http-write",
        field: "addDrive",
        caller: null,
        actions: ["CREATE_DOCUMENT"],
      }),
    ).toContain("or send a host session token");
  });

  it("names the session of a known caller", () => {
    expect(
      describeUnsignedWriteCaller({ address: "0xabc", label: "agent x" }),
    ).toBe("0xabc (agent x)");
    expect(describeUnsignedWriteCaller({ address: "0xabc" })).toBe("0xabc");
    expect(describeUnsignedWriteCaller(null)).toBe("an anonymous caller");
  });

  it("gives the ph mutate line for the refused actions", () => {
    expect(phMutateFix(["CREATE_DOCUMENT"])).toBe(
      "ph mutate --create <type> --parent <drive>",
    );
    expect(phMutateFix(["DELETE_DOCUMENT"])).toBe(
      "ph mutate --delete <document>",
    );
    expect(phMutateFix(["SET_NAME", "ADD_FILE"])).toBe(
      "ph mutate <document> --actions <file.json>",
    );
  });

  it("has text for every reason", () => {
    for (const reason of UNSIGNED_WRITE_REASONS) {
      expect(UNSIGNED_WRITE_CASES[reason]).toBeTruthy();
      const message = unsignedWriteMessage({
        reason,
        field: "Mutation.execute",
        caller: { address: "0xabc" },
        actions: ["SET_NAME"],
      });
      expect(message).toMatch(/^Refused: this host signs no writes/);
      expect(message).toContain("0xabc");
    }
    expect(
      unsignedWriteMessage({
        reason: "no-identity",
        field: "Mutation.execute",
        caller: null,
        actions: ["SET_NAME"],
      }),
    ).toContain("names no user");
    expect(
      unsignedWriteMessage({
        reason: "mcp-http-write",
        field: "createDocument",
        caller: null,
        actions: ["CREATE_DOCUMENT"],
      }),
    ).toContain("`ph mcp`");
  });

  it("builds the GraphQL extensions", () => {
    expect(
      unsignedWriteExtensions({
        reason: "unsigned-actions",
        field: "Mutation.execute",
        caller: { address: "0xabc", label: "test" },
        actions: ["SET_NAME"],
      }),
    ).toEqual({
      code: UNSIGNED_WRITE_ERROR_CODE,
      reason: "unsigned-actions",
      field: "Mutation.execute",
      caller: { address: "0xabc", label: "test" },
      actions: ["SET_NAME"],
    });
    expect(
      unsignedWriteExtensions({
        reason: "host-built",
        field: "Mutation.renameDocument",
        caller: null,
        actions: [],
      }).caller,
    ).toBeNull();
  });
});
