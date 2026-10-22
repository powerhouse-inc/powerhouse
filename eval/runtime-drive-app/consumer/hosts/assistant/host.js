// @ts-check
// The agent host: a headless Mastra agent whose REACTOR IS THE PROJECT'S
// SWITCHBOARD, attached as a remote client — no reactor embedded in the agent
// and glued to its lifetime; the switchboard outlives agent sessions, and N
// agents attach to ONE reactor. Serves an OpenAI-compatible chat-completions
// API; without a model configured it answers as the demo agent.
// Requires @powerhousedao/clint in devDependencies (the scaffold includes it).
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "flagged-app-assistant",

  runner: {
    module: "@powerhousedao/clint/mastra-runner",
    port: 4910,
    workdir: "${userData}/assistant",
  },

  profile: {
    appId: "inc.powerhouse.assistant.flagged-app",
    name: "flagged-app Assistant",
  },

  // A reactor host — hosting "remote": the runner attaches a reactor CLIENT
  // to a RUNNING switchboard (start it first: `ph run switchboard`, vetra,
  // or a compound that members it; an unreachable remote fails the attach
  // loudly, never auto-starts).
  reactor: {
    backends: {
      switchboard: {
        kind: "remote",
        remote: { host: "switchboard" }, // sibling host reference; use
        // { url: "https://…/graphql" } for
        // an external switchboard
      },
    },
    protocol: config.connect?.reactor ?? {},
  },

  config: {
    // model: "anthropic/claude-sonnet-4-5", // enable for real LLM responses
    //                                        (provider API key via env)
    prompts: { skillsDir: "agents", outDir: "dist/skills" },
  },
};
