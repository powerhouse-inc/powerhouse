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
server), \`vetra\` (compound: both, dev mode — what \`ph vetra\` runs).
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
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "vetra",

  // The compound starts each member via that member's own declared runner at
  // defaultVerb. "dev" is what makes vetra vetra: Vite package loader on the
  // switchboard, HMR studio on connect, codegen hot-reload.
  runner: {
    module: "@powerhousedao/ph-cli/runners/compound",
    defaultVerb: "dev",
  },

  // Member wrappers reference sibling hosts by folder name; a wrapper
  // overrides the member's sections by the same names (wrapper wins).
  children: {
    "vetra-studio": {
      host: "connect",
      runner: { port: config.vetra?.connectPort ?? 3001 },
    },
    "vetra-switchboard": {
      host: "switchboard",
    },
  },
};
`;

  const desktopHost = `// @ts-check
// The desktop shape: a production switchboard next to the BUILT Connect,
// supervised by the GENERIC compound (@powerhousedao/host-core). Run
// \`ph run connect build\` once, then \`ph run desktop\`. A desktop shell
// (ph-win) supervises exactly this command. At \`run\`, each member uses its
// own default mode below; \`ph run desktop <verb>\` forwards uniformly.
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "desktop",

  runner: {
    module: "@powerhousedao/host-core/runners/compound",
  },

  profile: {
    appId: "inc.powerhouse.desktop.${projectName}",
    name: "${projectName} Desktop",
  },

  children: {
    "desktop-switchboard": {
      host: "switchboard",
      reactor: {
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
      },
    },
    "desktop-connect": {
      host: "connect",
      // serve the BUILT Connect; the loopback port doubles as a shell's
      // readiness probe
      runner: { defaultVerb: "serve", port: config.studio?.port ?? 3000 },
    },
  },

  config: {
    startOrder: ["desktop-switchboard", "desktop-connect"],
    projectDrivesIntoConnect: true, // defaultDrives -> this switchboard's drives
    cspRegistrySync: true, // patch the baked CSP for the runtime registry
    runtimeRecord: true, // single-instance record under .ph/run/
  },
};
`;

  const agentsIndex = `/**
 * agents/ — agent definitions (profiles, skills, commands, triggers).
 * Scaffolded empty; the agent-host phases of uniform-runners populate it.
 */
export {};
`;

  return {
    readme,
    connectHost,
    switchboardHost,
    vetraHost,
    desktopHost,
    agentsIndex,
  };
}
