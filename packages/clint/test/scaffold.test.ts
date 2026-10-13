import { describe, expect, it } from "vitest";
import { CLINT_PORT_STATUS } from "../src/index.js";
import * as clintRunner from "../src/runners/clint-runner.js";
import * as mastraRunner from "../src/runners/mastra-runner.js";

describe("@powerhousedao/clint scaffold (P5.1)", () => {
  it("pins the runner contract shapes", () => {
    expect(clintRunner.kind).toBe("compound");
    expect(mastraRunner.kind).toBe("reactor");
    expect(clintRunner.hostSchema).toBeDefined();
    expect(mastraRunner.hostSchema).toBeDefined();
    expect(CLINT_PORT_STATUS).toBe("P5.1-scaffold");
  });

  it("refuses honestly until the port lands", () => {
    const host = { name: "x", runner: { module: "m" } };
    const ctx = { projectRoot: ".", verb: "run", env: {} };
    expect(() => clintRunner.run(host, ctx)).toThrow(/P5\.4.*in progress/s);
    expect(() => mastraRunner.run(host, ctx)).toThrow(/P5\.6.*in progress/s);
  });
});
