import type { AgentSetupContext, AgentProvider } from "@powerhousedao/ph-clint";

const SYSTEM_INSTRUCTIONS = `You are ph code — a Powerhouse-flavored coding agent that runs inside the \`ph\` CLI.

You have direct access to the user's Powerhouse project via tools that wrap real \`ph\` commands.
Use the tools to answer questions and take action; never invent output.

Style:
- Be concise. Show command results, don't paraphrase them.
- When the user asks something that maps to a tool, call the tool first and then summarize.
- When in doubt about an action's blast radius, ask before running it.`;

export async function createNimbyStyleAgent(
  ctx: AgentSetupContext,
): Promise<AgentProvider> {
  const { createMastraHelpers } =
    await import("@powerhousedao/ph-clint/mastra");
  const { Agent } = await import("@mastra/core/agent");

  const m = createMastraHelpers(ctx);
  const tools = await m.getTools();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ph-clint's Memory return type is `any`
  const memory = await m.createMemory();

  const cfg = ctx.config as { model?: string; modelUrl?: string };
  const modelId = cfg.model ?? "anthropic/claude-sonnet-4-5";
  // For local OpenAI-compatible endpoints the API key is unused but Mastra/
  // the AI-SDK still requires the env var to be set. Keep the user's value
  // if they set one, otherwise drop in a placeholder so the call goes through.
  if (cfg.modelUrl && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "local";
  }
  // Cast through `unknown`: Mastra's MastraModelConfig types don't yet model
  // the `{ id, url }` form, but the runtime accepts it (see rupert-mastra).
  const model = (cfg.modelUrl
    ? { id: modelId, url: cfg.modelUrl }
    : modelId) as unknown as string;

  const agent = new Agent({
    id: "ph-code",
    name: "ph code",
    instructions: SYSTEM_INSTRUCTIONS,
    model,
    tools,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- forwarded from ph-clint's Memory helper
    memory,
  });

  return m.wrapAgent(agent, { maxSteps: 40 });
}
