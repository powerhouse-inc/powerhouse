import { describe, expect, it } from "vitest";
import {
  ReactorMonitorVersion,
  provision,
  type ReactorDescriptor,
} from "../src/index.js";

describe("reactor-monitor placeholder API", () => {
  it("exposes a version constant", () => {
    expect(ReactorMonitorVersion).toBe("0.1.0");
  });

  it("provision() rejects with NotImplemented until hosting lands (W0.2/W3.1)", async () => {
    const descriptor: ReactorDescriptor = { kind: "worker", name: "test" };

    await expect(provision(descriptor)).rejects.toThrow(/NotImplemented/);
  });

  it("accepts every ReactorDescriptor.kind discriminant", async () => {
    const kinds: ReactorDescriptor["kind"][] = [
      "worker",
      "in-process",
      "remote",
    ];

    for (const kind of kinds) {
      await expect(provision({ kind, name: kind })).rejects.toThrow(
        /NotImplemented/,
      );
    }
  });
});
