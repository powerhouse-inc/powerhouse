/**
 * uniform-runners scaffold: the hosts/ folder (host definitions) and the
 * agents/ stub. Host files are static PROJECTIONS of powerhouse.config.json —
 * every port is referenced, not copied, so powerhouse.config.json stays the
 * single value store and `ph install` & friends keep one file to edit.
 * Templates take the project name only for display identity; names never seed
 * storage identity, so renaming a host is always safe.
 */

export interface HostsTemplates {
  readme: string;
  connectHost: string;
  switchboardHost: string;
  vetraHost: string;
  desktopHost: string;
  assistantHost: string;
  cliHost: string;
  agentsReadme: string;
  agentsProfiles: string;
  agentsBaseProfile: string;
  agentsExampleSkill: string;
  agentsIndex: string;
}

export function buildHostsTemplates(projectName: string): HostsTemplates {
  const readme = `# hosts/

Each subfolder defines one host: an application this project can run via
\`ph run <host-name> [verb]\`. A host.js is a static projection of
powerhouse.config.json — plain data, default-exported:

\`\`\`js
export default {
  name,     // display identity (never seeds storage identity — renaming is safe)
  runner,   // { module, ...process options } — ph run imports and calls runner.module
  config,   // handed to the runner's runtime whole
  reactor,  // reactor runners only (projection arrives in a later phase)
  children, // compound runners only — reactor XOR children
};
\`\`\`

Rules: the only legal import is the project's powerhouse.config.json; the
export must survive a JSON round trip (no functions); \`ph <host-name>\` is
sugar for \`ph run <host-name>\` (built-in commands win name collisions).

Scaffolded hosts: \`connect\` (studio dev server), \`switchboard\` (API/reactor
server), \`vetra\` (compound: both, dev mode — what \`ph vetra\` runs),
\`desktop\` (production switchboard + built Connect on the generic compound),
\`assistant\` (headless agent API on the project switchboard) and \`cli\`
(the clint shell scheduling the others as services).
`;

  const connectHost = `// @ts-check
// Static projection of powerhouse.config.json — only that import is allowed;
// runtime behavior lives in the runner module named below.
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "${projectName}-connect",

  // \`ph run connect\` (sugar: \`ph connect\` once hosts are active) imports
  // and calls this module. Options here are consumed by the runner and never
  // emitted into the runtime config.
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    port: config.studio?.port ?? 3000, // referenced — the value stays in powerhouse.config.json

    // THE COMPOSITION — presence is activation (no feature flags behind
    // these lines). The generic shell is Connect's chrome: sidebar, home,
    // /d/ URLs, drive management. It OWNS the drive-chrome toggles — configure
    // them in this entry's config: { allowAddDrive, sections: { remote, local } }.
    // Removing the entry turns those toggles OFF (live today — no add-drive
    // affordance). NOTE: it does not yet unmount the chrome UI itself; gating
    // the shell on this plugin ("go headless / swap your own shell") is on the
    // roadmap. Branding is NOT set here — it stays top-level connect.branding.
    plugins: ["@powerhousedao/connect/plugins/generic"],
  },

  // handed to the runtime whole: the connect.* block, projected unchanged
  config: config.connect ?? {},

  profile: {
    appId: "inc.powerhouse.connect.${projectName}",
    name: "${projectName}",
  },

  // The replay/admission protocol reaches this host through \`config\` above:
  // the connect.reactor block of powerhouse.config.json. The switchboard host
  // references the SAME block, so client and server cannot diverge.
};
`;

  const switchboardHost = `// @ts-check
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "${projectName}-switchboard",

  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    port: config.reactor?.port ?? 4001, // referenced — single value store

    // THE COMPOSITION — the switchboard defaults, each line removable (a
    // curated API deletes what it does not serve). Presence is activation.
    plugins: [
      "@powerhousedao/switchboard/plugins/mcp",
      "@powerhousedao/switchboard/plugins/attachments",
      "@powerhousedao/switchboard/plugins/workflows",
    ],
  },

  // \`auth\` is read from powerhouse.config.json by the server itself.
  // \`protocol\` is SINGLE-SOURCED: this references the same connect.reactor
  // block of powerhouse.config.json that the connect host receives via its
  // config — one store for the replay/admission consensus, projected here
  // onto the server's REACTOR_* / CREATE_SIGNATURE_POLICY env. A pre-set env
  // var contradicting it fails boot by name.
  reactor: {
    protocol: config.connect?.reactor ?? {},
  },
};
`;

  const vetraHost = `// @ts-check
// vetra is the GENERIC compound over the project's switchboard and connect
// members, each composed with the Vetra Studio plugins — there is no
// vetra-specific runner. Studio is verb-scoped: \`ph run vetra dev\` gets the
// Vite package loader + studio UI + codegen reload; \`ph run vetra\` (run) is
// the same stack headless. Members spread their sibling host's composition
// (full inclusion) and add studio.
// Requires @powerhousedao/vetra-studio in devDependencies (private until its
// first publish — link the workspace package meanwhile; added to the
// versioned scaffold deps at that publish event, same as host-core/clint).
import config from "../../powerhouse.config.json" with { type: "json" };
import switchboard from "../switchboard/host.js";
import connect from "../connect/host.js";

export default {
  name: "vetra",

  runner: {
    module: "@powerhousedao/host-core/runners/compound",
    defaultVerb: "dev",
  },

  children: {
    "vetra-switchboard": {
      host: "switchboard",
      runner: {
        plugins: [
          ...switchboard.runner.plugins,
          { module: "@powerhousedao/vetra-studio/switchboard", verbs: ["dev"] },
        ],
      },
      // The studio drives, declared (projectHash keeps today's ids):
      reactor: {
        ...switchboard.reactor,
        drives: [
          { slug: "vetra", name: "Vetra", projectHash: true, preferredEditor: "vetra-drive-app" },
          { slug: "vetra-preview", name: "Vetra Preview", projectHash: true },
        ],
      },
    },
    "vetra-studio": {
      host: "connect",
      runner: {
        port: config.vetra?.connectPort ?? 3001,
        plugins: [
          ...connect.runner.plugins,
          { module: "@powerhousedao/vetra-studio/connect", verbs: ["dev"] },
        ],
      },
    },
  },
};
`;

  const desktopHost = `// @ts-check
// The desktop shape: a production switchboard next to the BUILT Connect,
// supervised by the desktop runner (@powerhousedao/desktop — run/serve are
// the generic compound; \`dev\` opens a native shell window; \`build\` stages
// the shippable stack). Run \`ph run connect build\` once, then
// \`ph run desktop\`. At \`run\`, each member uses its own default mode below;
// \`ph run desktop <verb>\` forwards uniformly. Members derive from the sibling
// hosts (full inclusion); the server's drive list is hoisted once and the
// connect member attaches it as REMOTES (one declaration, two projections).
import config from "../../powerhouse.config.json" with { type: "json" };
import switchboard from "../switchboard/host.js";
import connect from "../connect/host.js";

// Declared once: the server member serves these locally; the connect member
// attaches the SAME list as remote drives (a compound's Connect must not
// duplicate-declare the local drives the server owns).
const serverPort = switchboard.runner.port;
const serverDrives = [{ slug: "powerhouse", name: "${projectName}" }];

export default {
  name: "desktop",

  runner: {
    module: "@powerhousedao/desktop/runner",
    // NATIVE WINDOW (optional): point \`shell\` at a ph-win-desktop checkout;
    // \`ph run desktop dev\` then opens the shell around this stack with no
    // environment wiring, and \`ph run desktop build\` stages the shippable
    // stack (hosts + config + built Connect + vendored ph-cli) into the
    // shell for a no-env installed app. Headless verbs need no shell.
    // shell: {
    //   project: "../ph-win-desktop",
    //   window: { title: "${projectName}", width: 1440, height: 900 },
    //   tray: true,
    //   fileAssociations: [".phd"],
    // },
  },

  profile: {
    appId: "inc.powerhouse.desktop.${projectName}",
    name: "${projectName} Desktop",
  },

  config: {
    startOrder: ["desktop-switchboard", "desktop-connect"],
    cspRegistrySync: true, // patch the baked CSP for the runtime registry
    runtimeRecord: true, // single-instance record under .ph/run/
  },

  children: {
    "desktop-switchboard": {
      host: "switchboard",
      runner: { plugins: [...switchboard.runner.plugins] },
      reactor: {
        protocol: switchboard.reactor.protocol,
        backends: {
          main: {
            // Per-user data dir; \${userData} resolves at the runner (a shell
            // points it at the OS profile via PH_USER_DATA_DIR).
            storage: { kind: "path", dataDir: "\${userData}/pglite" },
            readModel: { url: "\${userData}/pglite" },
            // the reactor can fetch models Connect installs at runtime
            packages: { dynamic: true },
          },
        },
        drives: serverDrives,
      },
    },
    "desktop-connect": {
      host: "connect",
      // serve the BUILT Connect; the loopback port doubles as a shell's
      // readiness probe
      runner: {
        defaultVerb: "serve",
        port: config.studio?.port ?? 3000,
        plugins: [...connect.runner.plugins],
      },
      // Attach the server's drives as remotes (replaces the old implicit
      // projectDrivesIntoConnect flag with legible derivation):
      reactor: {
        ...connect.reactor,
        drives: serverDrives.map((d) => ({
          slug: d.slug,
          remote: { url: \`http://127.0.0.1:\${serverPort}/d/\${d.slug}\` },
        })),
      },
    },
  },
};
`;

  const assistantHost = `// @ts-check
// The agent host: a headless Mastra agent whose REACTOR IS THE PROJECT'S
// SWITCHBOARD, attached as a remote client — no reactor embedded in the agent
// and glued to its lifetime; the switchboard outlives agent sessions, and N
// agents attach to ONE reactor. Serves an OpenAI-compatible chat-completions
// API; without a model configured it answers as the demo agent.
// Requires @powerhousedao/clint in devDependencies (the scaffold includes it).
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "${projectName}-assistant",

  runner: {
    module: "@powerhousedao/clint/mastra-runner",
    port: 4910,
    workdir: "\${userData}/assistant",
  },

  profile: {
    appId: "inc.powerhouse.assistant.${projectName}",
    name: "${projectName} Assistant",
  },

  // A reactor host — hosting "remote": the runner attaches a reactor CLIENT
  // to a RUNNING switchboard (start it first: \`ph run switchboard\`, vetra,
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
`;

  const cliHost = `// @ts-check
// The compound CLI: the clint shell — children below are SCHEDULED by its
// services manager (start/stop/ps/logs, per-run log files, re-attach), not
// merely started. \`ph run cli\` brings the stack up; \`ph run cli dev\` adds
// a chat shell against the agents below.
// Requires @powerhousedao/clint in devDependencies (the scaffold includes it).
export default {
  name: "cli",

  runner: {
    module: "@powerhousedao/clint/clint-runner",
    // "detached": children survive CLI exit and re-attach on the next run
    // (clint's own posture); "attached" tears them down on Ctrl+C.
    lifecycle: "detached",
  },

  children: {
    switchboard: { host: "switchboard" },
    assistant: { host: "assistant" },
  },

  config: {
    startOrder: ["switchboard", "assistant"],
    // THE AGENTS MANAGER — named OpenAI-compatible endpoints; a sibling-host
    // reference resolves through that host's runner.port.
    agents: {
      assistant: { host: "assistant" },
    },
  },
};
`;

  const agentsReadme = `# agents/

Prompt sources for this project's agent hosts (compiled by
\`ph run assistant build\`):

- \`agent-profiles/\` — profile sections, concatenated per profiles.json
- \`skills-tpl/<skill>/\` — Handlebars skill templates → SKILL.md + references
- \`skills-ext/<skill>/\` — external skills copied as-is
- \`profiles.json\` — which profiles to build: [{ "name", "sections": [...] }]

Output lands in \`dist/skills/\`.
`;

  const agentsProfiles = `[
  { "name": "${projectName}Agent", "sections": ["AgentBase.md"] }
]
`;

  const agentsBaseProfile = `# ${projectName} Agent

You are the ${projectName} project agent. You operate on this project's
Powerhouse documents through the project switchboard.

Be concrete: name documents, drives and operations explicitly. When asked to
change a document, state which operation you apply and why.
`;

  const agentsExampleSkill = `# Getting started

Describe this project to a newcomer: what document models it defines, what
drives exist, and where the interesting documents live.

Built at: {{builtAt}}
`;

  const agentsIndex = `/**
 * agents/ — prompt sources for the project's agent hosts. See README.md;
 * compiled by \`ph run assistant build\` into dist/skills/.
 */
export {};
`;

  return {
    readme,
    connectHost,
    switchboardHost,
    vetraHost,
    desktopHost,
    assistantHost,
    cliHost,
    agentsReadme,
    agentsProfiles,
    agentsBaseProfile,
    agentsExampleSkill,
    agentsIndex,
  };
}
