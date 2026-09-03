// Import smoke test: evaluating the vendored builder must not hit the
// runtime import cycles the upstream bundler papers over.
import { describe, expect, it } from "vitest";

describe("vendored builder modules", () => {
  it("loads the builder store, canvas and pieces selector", async () => {
    const builderHooks =
      await import("./vendor/web/app/builder/builder-hooks.js");
    expect(builderHooks.createBuilderStore).toBeTypeOf("function");

    const canvas =
      await import("./vendor/web/app/builder/flow-canvas/index.js");
    expect(canvas.FlowCanvas).toBeDefined();

    const selector =
      await import("./vendor/web/app/builder/pieces-selector/index.js");
    expect(selector).toBeDefined();

    const shell = await import("./components/builder-shell.js");
    expect(shell.BuilderShell).toBeTypeOf("function");
    // Evaluating the vendored bundle takes ~3s alone and can exceed the
    // default 5s timeout when other test files compete for CPU.
  }, 30_000);

  it("applies flow operations through the vendored reducer", async () => {
    const { flowOperations, FlowOperationType } =
      await import("./vendor/shared/index.js");
    const { deriveFlowVersion } =
      await import("./mapping/derive-flow-version.js");
    const { version } = deriveFlowVersion({
      name: "smoke",
      status: "DRAFT",
      version: 1,
      trigger: {
        id: "t1",
        blockType: "core#manual",
        config: {},
        connectionId: null,
      },
      steps: [],
      edges: [],
    });
    const renamed = flowOperations.apply(version, {
      type: FlowOperationType.CHANGE_NAME,
      request: { displayName: "renamed" },
    });
    expect(renamed.displayName).toBe("renamed");
  });
});
