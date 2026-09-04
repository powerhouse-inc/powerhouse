import { describe, expect, it } from "vitest";
import { CoreBlockExecutor } from "../../src/engine/blocks.js";

const core = new CoreBlockExecutor();

const branch = (config: Record<string, unknown>) =>
  core.execute({
    blockType: "core#branch",
    stepId: "s",
    stepKey: "s",
    config,
  } as never);

describe("core#branch", () => {
  it("routes on truthiness when no equals is set", async () => {
    expect((await branch({ condition: "yes" })).port).toBe("true");
    expect((await branch({ condition: "" })).port).toBe("false");
    expect((await branch({ condition: "false" })).port).toBe("false");
    expect((await branch({ condition: "0" })).port).toBe("false");
  });

  it("compares against equals, trimmed and case-insensitively", async () => {
    const equals = "create";
    expect((await branch({ condition: "create", equals })).port).toBe("true");
    expect((await branch({ condition: " Create\n", equals })).port).toBe("true");
    // Both sides non-empty: truthiness alone could not tell these apart.
    expect((await branch({ condition: "edit", equals })).port).toBe("false");
    expect((await branch({ condition: "", equals })).port).toBe("false");
  });
});
