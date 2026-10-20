// @ts-check
// The agent host: a headless Mastra agent whose REACTOR IS THE PROJECT'S
// SWITCHBOARD, attached as a remote client — no reactor embedded in the agent
// and glued to its lifetime; the switchboard outlives agent sessions, and N
// agents attach to ONE reactor. Serves an OpenAI-compatible chat-completions
// API; without a model configured it answers as the demo agent.
// Requires @powerhousedao/clint in devDependencies (the scaffold includes it).
import config from "../../powerhouse.config.json" with { type: "json" };

/** @satisfies {PHHost} */
export default {
  name: "my-project-assistant",

  runner: {
    module: "@powerhousedao/clint/mastra-runner",
    port: config.assistant?.port ?? 4910, // referenced — single value store
  },

  profile: {
    appId: "inc.powerhouse.assistant.my-project",
    name: "my-project Assistant",
  },

  // A reactor host — hosting "remote": the runner attaches a reactor CLIENT
  // to a RUNNING switchboard (start it first: `ph run switchboard`, vetra,
  // or a compound that members it; an unreachable remote fails the attach
  // loudly, never auto-starts).
  reactor: {
    backends: {
      switchboard: {
        kind: "remote",
        // The running switchboard's GraphQL endpoint, read from its live
        // outputs (after `ph generate hosts`: switchboard.endpoints.graphql
        // from ../switchboard/outputs.js). A literal URL attaches to an
        // external switchboard.
        remote: {
          url: {
            $output: { host: "switchboard", path: ["endpoints", "graphql"] },
          },
        },
      },
    },
    protocol: config.connect?.reactor ?? {},
  },

  config: {
    // Enable for real LLM responses. The key is read from the environment
    // when the host starts (`ph run assistant` fails naming it when unset):
    // model: "openrouter/anthropic/claude-sonnet-4.5",
    // apiKey: { $env: "OPENROUTER_API_KEY" },
    prompts: { skillsDir: "agents", outDir: "dist/skills" },
  },
};
