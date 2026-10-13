import { describe, expect, it } from "vitest";

import * as clintRunner from "../src/runners/clint-runner.js";
import * as mastraRunner from "../src/runners/mastra-runner.js";

describe("@powerhousedao/clint scaffold (P5.1)", () => {
  it("pins the runner contract shapes", () => {
    expect(clintRunner.kind).toBe("compound");
    expect(mastraRunner.kind).toBe("reactor");
    expect(clintRunner.hostSchema).toBeDefined();
    expect(mastraRunner.hostSchema).toBeDefined();
  });

  it("clint-runner refuses honestly until P5.4 lands", () => {
    const host = { name: "x", runner: { module: "m" } };
    const ctx = { projectRoot: ".", verb: "run", env: {} };
    expect(() => clintRunner.run(host, ctx)).toThrow(/P5\.4.*in progress/s);
  });

  it("mastra-runner exposes its real verbs (P5.6 landed)", () => {
    expect(typeof mastraRunner.run).toBe("function");
    expect(typeof mastraRunner.serve).toBe("function");
    expect(typeof mastraRunner.build).toBe("function");
  });
});
