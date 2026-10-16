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
(switchboard + Connect together, Connect as a remote client).

### Reactor-client topologies (what runs the reactor, and where)

The \`reactor.backends\` of a Connect host select which of four clients it
runs — one field, derived from the backend topology:

| host | backends | reactorClient | reactor + storage |
|---|---|---|---|
| \`connect\` (standalone) | one \`worker\` | \`worker\` | the tab's own reactor in a SharedWorker (PGlite in-worker) |
| \`cli\` → connect member | one \`remote\` | \`remote\` | NO local reactor — a pure client to the switchboard over GraphQL (no PGlite) |
| \`desktop\` → connect member | — (serverDrives remote drive) | router/local | the tab's reactor PLUS a SYNCHRONIZED remote drive (local replica, keeps PGlite) |

The lesson the \`cli\` vs \`desktop\` split teaches: a **remote client** proxies
to the switchboard and stores nothing locally (no PGlite); a **synchronized
remote drive** keeps a local replica and therefore needs PGlite by design.
The \`in-process\` mode (main-thread reactor) is the fourth option — set one
\`in-process\` backend instead of \`worker\`.

The single project drive (\`powerhouse\`) is OWNED by the switchboard; standalone
Connect has its own local copy; the \`cli\`/\`desktop\` compounds re-point Connect
at the switchboard's.
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
    // /d/ URLs, drive management. It OWNS the drive-chrome toggles — passed in
    // its \`config\` here. Removing the entry turns those toggles OFF (live
    // today — no add-drive affordance). NOTE: it does not yet unmount the
    // chrome UI itself; gating the shell on this plugin ("go headless / swap
    // your own shell") is on the roadmap. Branding is NOT set here — it stays
    // top-level connect.branding.
    plugins: [
      {
        module: "@powerhousedao/connect/plugins/generic",
        config: {
          allowAddDrive: config.connect?.drives?.allowAddDrive,
          sections: config.connect?.drives?.sections,
        },
      },
    ],
  },

  // handed to the runtime whole: the connect.* block, projected unchanged
  config: config.connect ?? {},

  profile: {
    appId: "inc.powerhouse.connect.${projectName}",
    name: "${projectName}",
  },

  // Standalone Connect runs its OWN reactor (reactorClient derived from the
  // backends below — a lone \`worker\` backend → the worker reactor, PGlite in
  // a SharedWorker). The default drive lives in the tab's reactor. The
  // cli/desktop compounds re-point this same drive at the switchboard instead
  // — see those hosts. \`protocol\` is single-sourced from the connect.reactor
  // block both this host and the switchboard read, so they cannot diverge.
  reactor: {
    protocol: config.connect?.reactor ?? {},
    backends: {
      main: { kind: "worker" },
    },
    drives: [{ slug: "powerhouse", name: "${projectName}" }],
  },
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
    // The drive this switchboard serves. The cli/desktop compounds read this
    // list and point Connect at it (as a remote client / remote drive), so
    // the drive is OWNED in exactly one place.
    drives: [{ slug: "powerhouse", name: "${projectName}" }],
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
          // The browser half of workflows: loads Workflow Studio and attaches
          // the Workflows drive the sibling's workflows plugin serves — the
          // compound derives the URL from that member, so the link is here.
          {
            module: "@powerhousedao/connect/plugins/workflows",
            config: { drive: { from: "vetra-switchboard", slug: "workflows" } },
          },
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
// the shippable stack). Run \`ph run connect build\`, then \`ph build\`
// (the server loads the project's document models from dist/, which a
// Connect build empties), then
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
    // NATIVE WINDOW: two ways to get one (headless verbs need neither).
    //
    // 1. BUILDER-OWNED IDENTITY (recommended, no Rust): run
    //    \`ph generate desktop-shell\` to scaffold hosts/desktop/app.json.
    //    \`ph run desktop dev\` projects it into a generated Tauri shell that
    //    depends on the published ph-desktop-shell crate and opens the window
    //    around this stack; \`ph run desktop build\` produces installers for
    //    this OS (nsis / app+dmg / deb+appimage). Needs Rust + the Tauri CLI.
    //
    // 2. PREBUILT/HAND-MAINTAINED shell: point \`shell.project\` at a checkout.
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
            // The user's .ph tree, same names as the project's: \${userData}
            // resolves at the runner — the project root in the CLI, the OS
            // profile dir in a shell (PH_USER_DATA_DIR). The reactor store is
            // named here for clarity; the read model (.ph/read-storage),
            // identity and run records follow the same root by default.
            // NEVER point readModel at this dir: two PGlite instances on one
            // data dir corrupt it (the runner refuses the declaration).
            storage: { kind: "path", dataDir: "\${userData}/.ph/reactor-storage" },
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
        plugins: [
          ...connect.runner.plugins,
          // Workflow Studio over the server's Workflows drive (derived).
          {
            module: "@powerhousedao/connect/plugins/workflows",
            config: { drive: { from: "desktop-switchboard", slug: "workflows" } },
          },
        ],
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
// \`ph run cli\` brings up the switchboard + Connect together as one
// supervised stack (generic compound). The drive lives in the switchboard;
// Connect runs as a pure REMOTE CLIENT of it — a lone remote backend makes
// reactorClient "remote", so this Connect builds NO local reactor and never
// downloads PGlite. (Contrast desktop, where Connect takes the same drive as
// a SYNCHRONIZED remote drive — a local replica, which keeps PGlite by
// design. remote client = no local store; synchronized remote drive = local
// store.) Standalone \`ph run connect\` is untouched — still a local reactor.
import switchboard from "../switchboard/host.js";
import connect from "../connect/host.js";

// The drive(s) the switchboard serves, and its port — the single source
// Connect's remote attachment derives from.
const serverPort = switchboard.runner.port;
const serverDrives = switchboard.reactor.drives ?? [];

export default {
  name: "cli",

  // run → each member starts at "run": switchboard = server, Connect = studio
  // (no build step needed).
  runner: {
    module: "@powerhousedao/host-core/runners/compound",
  },

  config: {
    startOrder: ["cli-switchboard", "cli-connect"],
  },

  children: {
    // Inherits the switchboard host wholesale — including its drive.
    "cli-switchboard": { host: "switchboard" },

    // Connect as a remote client (full-statement reactor override; the
    // standalone connect host's own reactor is untouched). The lone remote
    // backend selects reactorClient "remote"; the remote default drive(s)
    // give the client the Switchboard URL to proxy to.
    "cli-connect": {
      host: "connect",
      runner: {
        plugins: [
          ...connect.runner.plugins,
          // Workflow Studio over the server's Workflows drive (derived).
          {
            module: "@powerhousedao/connect/plugins/workflows",
            config: { drive: { from: "cli-switchboard", slug: "workflows" } },
          },
        ],
      },
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: { url: \`http://127.0.0.1:\${serverPort}/graphql\` },
          },
        },
        drives: serverDrives.map((drive) => ({
          slug: drive.slug,
          remote: { url: \`http://127.0.0.1:\${serverPort}/d/\${drive.slug}\` },
        })),
      },
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
