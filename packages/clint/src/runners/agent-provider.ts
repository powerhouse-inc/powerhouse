import type { StreamChunk } from "../core/types.js";

/**
 * The mastra-runner's provider seam: a real Mastra agent when a model is
 * configured, and a DEMO provider otherwise — same posture as the ph-rupert
 * example: the host answers without an API key, loudly saying it is the demo.
 */
export interface AgentStreamProvider {
  readonly modelId: string;
  stream(
    prompt: string,
    options: { threadId: string },
  ): AsyncIterable<StreamChunk>;
}

export function createDemoProvider(agentName: string): AgentStreamProvider {
  return {
    modelId: "demo",
    // eslint-disable-next-line require-yield -- single-chunk generator below
    async *stream(prompt: string) {
      const text =
        `You said: ${JSON.stringify(prompt.slice(0, 2000))}. ` +
        `I'm the ${agentName} demo agent — configure a model (host config ` +
        `\`model\` and \`apiKey\`) for real responses.`;
      yield { type: "text-delta", text } as StreamChunk;
    },
  };
}

export interface MastraProviderOptions {
  agentName: string;
  instructions: string;
  /** Mastra model-router string, e.g. `anthropic/claude-sonnet-4-5`. */
  model: string;
  /** The provider's API key (resolved host config). Absent: Mastra's model
   * router looks the provider's key up in the environment itself. */
  apiKey?: string;
  /** Tools the agent may call (Mastra `createTool` results), e.g. the
   * reactor read tools over the attached switchboard. */
  tools?: Record<string, unknown>;
  /** Tool-call rounds per turn; a framework knob (stays in code). */
  maxSteps?: number;
}

/** A model-router id names its provider: `<provider>/<model…>`. */
function isRouterModelId(model: string): model is `${string}/${string}` {
  const slash = model.indexOf("/");
  return slash > 0 && slash < model.length - 1;
}

/** Mastra's model config: the router id alone, or with an explicit key
 * (Mastra's OpenAI-compatible config object). */
export function mastraModelConfig(
  model: string,
  apiKey: string | undefined,
): string | { id: `${string}/${string}`; apiKey: string } {
  if (apiKey === undefined) return model;
  if (!isRouterModelId(model)) {
    throw new Error(
      `model "${model}" is not a model-router id ("<provider>/<model>"), so an apiKey cannot be attached to it.`,
    );
  }
  return { id: model, apiKey };
}

export async function createMastraProvider(
  options: MastraProviderOptions,
): Promise<AgentStreamProvider> {
  const { Agent } = await import("@mastra/core/agent");
  const { mapMastraStream } = await import("../integrations/mastra/stream.js");
  const agent = new Agent({
    id: options.agentName,
    name: options.agentName,
    instructions: options.instructions,
    // With an apiKey the router uses it; without, it resolves the
    // provider's key from the environment.
    model: mastraModelConfig(options.model, options.apiKey),
    ...(options.tools ? { tools: options.tools as never } : {}),
  });
  return {
    modelId: options.model,
    async *stream(prompt: string, streamOptions: { threadId: string }) {
      const result = await agent.stream(prompt, {
        memory: undefined,
        threadId: streamOptions.threadId,
        maxSteps: options.maxSteps ?? 8,
      } as never);
      yield* mapMastraStream(
        (result as { fullStream: AsyncIterable<unknown> }).fullStream as never,
      );
    },
  };
}
