// Opt-in integration check against a running workflow runtime:
//   PH_WORKFLOWS_RUNTIME_URL=http://localhost:4002/graphql/workflow-runtime pnpm vitest run ai/workflow-tools.live.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { setRuntimeUrl } from "../editors/workflow-editor/runtime-api.js";
import { workflowTools } from "./workflow-tools.js";

const url = process.env.PH_WORKFLOWS_RUNTIME_URL;

describe.skipIf(!url)("workflow tools against a live runtime", () => {
  const tool = (name: string) => workflowTools.find((t) => t.name === name)!;

  beforeAll(() => setRuntimeUrl(url!));

  it("resolves the HTTP send_request block and its props", async () => {
    const blocks = (await tool("getWorkflowPieceBlocks").callback({
      packageName: "@activepieces/piece-http",
    } as never)) as { actions: { blockType: string }[] };
    const send = blocks.actions.find((a) =>
      a.blockType.endsWith("#send_request"),
    );
    expect(send).toBeDefined();
    const config = (await tool("getWorkflowBlockConfig").callback({
      blockType: send!.blockType,
    } as never)) as {
      props: { name: string; required: boolean }[];
      requiresConnection: boolean;
    };
    expect(config.requiresConnection).toBe(false);
    expect(config.props.find((p) => p.name === "url")?.required).toBe(true);
  }, 60_000);

  it("lists runs", async () => {
    const runs = (await tool("listWorkflowRuns").callback({
      limit: 3,
    } as never)) as { runs: unknown[] };
    expect(Array.isArray(runs.runs)).toBe(true);
  }, 30_000);
});
