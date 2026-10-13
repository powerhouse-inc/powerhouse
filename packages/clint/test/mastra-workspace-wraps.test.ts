/**
 * Workspace tools must pass through the wrap registry.
 *
 * Mastra builds workspace tools inside the Agent at stream time
 * (Agent.listWorkspaceTools → createWorkspaceTools) — they never flow
 * through getTools(). wrapAgent() patches the agent's listWorkspaceTools so
 * ctx.wraps.tool applies to them; this test fails if that interception is
 * removed or if Mastra stops exposing listWorkspaceTools.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMastraHelpers } from "../src/integrations/mastra/index.js";
import { IDENTITY_WRAPS } from "../src/core/wraps.js";
import type { AgentSetupContext, WrapRegistry } from "../src/core/types.js";

function makeSetupCtx(workdir: string, wraps: WrapRegistry): AgentSetupContext {
  return {
    workdir,
    config: {},
    cliName: "test-cli",
    cliVersion: "0.0.0",
    context: { workdir, config: {} },
    commands: [],
    skills: [],
    wraps,
  } as unknown as AgentSetupContext;
}

describe("wrapAgent applies wrap registry to workspace tools", () => {
  let workdir: string;
  const wrappedNames: string[] = [];
  const executions: Array<{
    name: string;
    argCount: number;
    firstArg: unknown;
  }> = [];

  const recordingWraps: WrapRegistry = {
    ...IDENTITY_WRAPS,
    tool: (name, tool) => {
      wrappedNames.push(name);
      return {
        ...tool,
        execute: (...args: unknown[]) => {
          executions.push({ name, argCount: args.length, firstArg: args[0] });
          return tool.execute(...args);
        },
      };
    },
  };

  beforeAll(() => {
    workdir = mkdtempSync(join(tmpdir(), "ph-clint-ws-wraps-"));
  });

  afterAll(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("routes workspace tool names through ctx.wraps.tool and preserves execute arity", async () => {
    const m = createMastraHelpers(makeSetupCtx(workdir, recordingWraps));
    const workspace = await m.createWorkspace();

    const { Agent } = await import("@mastra/core/agent");
    const fakeModel = {
      specificationVersion: "v2",
      provider: "test",
      modelId: "test-model",
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error("not used");
      },
      doStream: async () => {
        throw new Error("not used");
      },
    };
    const agent = new Agent({
      id: "ws-test-agent",
      name: "WS Test Agent",
      instructions: "test",
      model: fakeModel as any,
      workspace,
    });

    m.wrapAgent(agent);

    // NOTE(port): core >=1.76 threads a getModel callback through the
    // (private) listWorkspaceTools options and calls it unconditionally.
    const tools = await (agent as any).listWorkspaceTools({
      runId: "test-run",
      getModel: async () => fakeModel,
    });
    const names = Object.keys(tools);
    expect(names).toEqual(
      expect.arrayContaining([
        "mastra_workspace_write_file",
        "mastra_workspace_edit_file",
      ]),
    );
    // Every exposed workspace tool went through the registry.
    expect(wrappedNames).toEqual(expect.arrayContaining(names));

    // Invoke the wrapped write tool the way Mastra does: execute(args, toolContext).
    const result = await tools.mastra_workspace_write_file.execute(
      { path: "note.txt", content: "hello from wrap test" },
      {},
    );
    expect(result).toBeDefined();
    expect(readFileSync(join(workdir, "note.txt"), "utf-8")).toBe(
      "hello from wrap test",
    );

    const writeCall = executions.find(
      (e) => e.name === "mastra_workspace_write_file",
    );
    expect(writeCall).toBeDefined();
    // Both invocation args reach the wrap; the first is the flat LLM input.
    expect(writeCall!.argCount).toBe(2);
    expect((writeCall!.firstArg as { path?: string }).path).toBe("note.txt");
  });
});
