import { z } from "zod";
import { defineCli } from "@powerhousedao/ph-clint";
import { phCliAdaptedCommands } from "./commands.js";
import { createNimbyStyleAgent } from "./agent.js";
import { getVersion } from "../get-version.js";

const configSchema = z.object({
  model: z
    .string()
    .default("anthropic/claude-sonnet-4-5")
    .describe(
      'Mastra model id, e.g. "anthropic/claude-sonnet-4-5" or ' +
        '"openai/Qwen3.6-27B-Q4_K_M.gguf" for a local server.',
    ),
  modelUrl: z
    .string()
    .optional()
    .describe(
      "Optional base URL for the model provider (OpenAI-compatible). " +
        'Set this to point at a local LLM, e.g. "http://192.168.178.191:8100/v1".',
    ),
});

const secretsSchema = z.object({
  anthropicApiKey: z
    .string()
    .optional()
    .describe(
      "Anthropic API key. Reads from ANTHROPIC_API_KEY by default.",
    ),
});

export function buildPhCodeCli() {
  const cli = defineCli({
    name: "ph-code",
    version: getVersion(),
    description:
      "Powerhouse coding agent. Runs your installed Powerhouse tools through a Mastra-driven REPL.",
    configSchema,
    secretsSchema,
    commands: phCliAdaptedCommands,
    interactive: {
      welcome: "ph code — type a prompt or /help. Ctrl-D to exit.",
    },
  });
  cli.configureAgent(createNimbyStyleAgent);
  return cli;
}
