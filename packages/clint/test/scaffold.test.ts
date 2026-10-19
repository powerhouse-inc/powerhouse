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

  it("clint-runner exposes its real verbs (P5.4 landed)", () => {
    expect(typeof clintRunner.run).toBe("function");
    expect(typeof clintRunner.dev).toBe("function");
    expect(typeof clintRunner.build).toBe("function");
    expect(clintRunner.serve).toBe(clintRunner.run);
  });

  it("mastra-runner exposes its real verbs (P5.6 landed)", () => {
    expect(typeof mastraRunner.run).toBe("function");
    expect(typeof mastraRunner.serve).toBe("function");
    expect(typeof mastraRunner.build).toBe("function");
  });
});
