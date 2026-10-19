import { describe, expect, it } from "vitest";
import {
  missingInPublished,
  publisherOf,
  runsAsText,
  shortAddress,
} from "./reactor-view.js";

const publish = (index: number, address?: string, error?: string) => ({
  index,
  ...(error ? { error } : {}),
  action: {
    type: "PUBLISH_WORKFLOW",
    context: address
      ? { signer: { user: { address }, signatures: [["sig"]] } }
      : { signer: { signatures: [] } },
  },
});

describe("who runs act as", () => {
  it("is the signer of the latest publish that applied", () => {
    expect(
      publisherOf([
        publish(1, "0xold"),
        publish(3, "0xrefused", "denied"),
        publish(2, "0x1234567890abcdef1234"),
      ]),
    ).toBe("0x1234567890abcdef1234");
    expect(publisherOf([publish(1, "0xa"), publish(2)])).toBeNull();
    expect(publisherOf([])).toBeUndefined();
  });

  it("reads as a short address, an unsigned publish, or none yet", () => {
    expect(runsAsText("0x1234567890abcdef1234", false)).toBe(
      `Runs as ${shortAddress("0x1234567890abcdef1234")} (last publisher)`,
    );
    expect(shortAddress("0x1234567890abcdef1234")).toBe("0x1234…1234");
    expect(runsAsText(null, false)).toMatch(/^Published unsigned/);
    expect(runsAsText(undefined, false)).toMatch(/^Not published yet/);
    expect(runsAsText(undefined, true)).toBeNull();
    expect(runsAsText("0xhost", false, "0xHOST")).toMatch(
      /^Published by the Switchboard/,
    );
  });
});

describe("missingInPublished", () => {
  it("lists published blocks that need a reactor connection and bind none", () => {
    expect(
      missingInPublished([
        { label: "Create invoice", requireReactor: "write" },
        { label: "Find", requireReactor: "read", reactorConnectionId: "rc" },
        { label: "Send mail", requireReactor: null },
      ]),
    ).toEqual(["Create invoice"]);
  });
});
