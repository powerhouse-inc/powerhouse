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
        `\`model\`, provider API key in the environment) for real responses.`;
      yield { type: "text-delta", text } as StreamChunk;
    },
  };
}

export interface MastraProviderOptions {
  agentName: string;
  instructions: string;
  /** Mastra model-router string, e.g. `anthropic/claude-sonnet-4-5`. */
  model: string;
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
    // Mastra's model router resolves provider/key from the environment.
    model: options.model as never,
  });
  return {
    modelId: options.model,
    async *stream(prompt: string, streamOptions: { threadId: string }) {
      const result = await agent.stream(prompt, {
        memory: undefined,
        threadId: streamOptions.threadId,
      } as never);
      yield* mapMastraStream(
        (result as { fullStream: AsyncIterable<unknown> }).fullStream as never,
      );
    },
  };
}
