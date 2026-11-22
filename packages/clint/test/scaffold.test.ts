import { describe, expect, it } from "vitest";

import * as mastraRunner from "../src/runners/mastra-runner.js";

describe("@powerhousedao/clint scaffold (P5.1)", () => {
  it("pins the runner contract shapes", () => {
    expect(mastraRunner.kind).toBe("reactor");
    expect(mastraRunner.hostSchema).toBeDefined();
  });

  it("mastra-runner exposes its real verbs (P5.6 landed)", () => {
    expect(typeof mastraRunner.run).toBe("function");
    expect(typeof mastraRunner.serve).toBe("function");
    expect(typeof mastraRunner.build).toBe("function");
  });
});
