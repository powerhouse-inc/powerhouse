import { describe, expect, it } from "vitest";
import {
  profileMessage,
  revokeMessage,
  SIGNATURE_WINDOW_MS,
} from "../src/signed-message.js";

// Ported from renown-package `subgraphs/renown-auth/tests/core.test.ts`: the
// server verifies these exact strings, so both repos pin them.
describe("signed messages", () => {
  it("revoke message is exact", () => {
    expect(revokeMessage("cred-1", "2026-09-28T12:00:00.000Z")).toBe(
      "Revoke Renown credential cred-1 at 2026-09-28T12:00:00.000Z",
    );
  });

  it("profile message hashes the payload and lowercases the address", async () => {
    const m = await profileMessage(
      "0xABC0000000000000000000000000000000000001",
      { username: "frank" },
      "t",
    );
    expect(m).toMatch(
      /^Update Renown profile 0xabc0000000000000000000000000000000000001 [0-9a-f]{64} at t$/,
    );
    expect(
      await profileMessage(
        "0xabc0000000000000000000000000000000000001",
        { username: "frank", userImage: null },
        "t",
      ),
    ).toBe(m);
    expect(
      await profileMessage(
        "0xabc0000000000000000000000000000000000001",
        { username: "other" },
        "t",
      ),
    ).not.toBe(m);
  });

  it("profile message is exact: sha256 of the canonical JSON payload", async () => {
    // sha256('{"username":"frank","userImage":null}')
    expect(
      await profileMessage(
        "0xABC0000000000000000000000000000000000001",
        { username: "frank" },
        "2026-09-28T12:00:00.000Z",
      ),
    ).toBe(
      "Update Renown profile 0xabc0000000000000000000000000000000000001 e586dca7432283bd3bc606f7650606a0407f43f27843c738a82b9146603e6130 at 2026-09-28T12:00:00.000Z",
    );
  });

  it("the signature window is ±10 minutes", () => {
    expect(SIGNATURE_WINDOW_MS).toBe(600_000);
  });
});
