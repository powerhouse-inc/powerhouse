// @ts-check
// The desktop shape: a production switchboard next to the BUILT Connect,
// supervised by the desktop runner (@powerhousedao/desktop — run/serve are
// the generic compound; `dev` opens a native shell window; `build` stages
// the shippable stack). Run `ph run connect build` once, then
// `ph run desktop`. At `run`, each member uses its own default mode below;
// `ph run desktop <verb>` forwards uniformly. Members derive from the sibling
// hosts (full inclusion); the server's drive list is hoisted once and the
// connect member attaches it as REMOTES (one declaration, two projections).
import config from "../../powerhouse.config.json" with { type: "json" };
import switchboard from "../switchboard/host.js";
import connect from "../connect/host.js";

// Declared once: the server member serves these locally; the connect member
// attaches the SAME list as remote drives (a compound's Connect must not
// duplicate-declare the local drives the server owns).
const serverPort = switchboard.runner.port;
const serverDrives = [{ slug: "powerhouse", name: "flagged-app" }];

export default {
  name: "desktop",

  runner: {
    module: "@powerhousedao/desktop/runner",
    // NATIVE WINDOW: two ways to get one (headless verbs need neither).
    //
    // 1. BUILDER-OWNED IDENTITY (recommended, no Rust): run
    //    `ph generate desktop-shell` to scaffold hosts/desktop/app.json.
    //    `ph run desktop dev` projects it into a generated Tauri shell that
    //    depends on the published ph-desktop-shell crate and opens the window
    //    around this stack; `ph run desktop build` produces installers for
    //    this OS (nsis / app+dmg / deb+appimage). Needs Rust + the Tauri CLI.
    //
    // 2. PREBUILT/HAND-MAINTAINED shell: point `shell.project` at a checkout.
    // shell: {
    //   project: "../ph-win-desktop",
    //   window: { title: "flagged-app", width: 1440, height: 900 },
    //   tray: true,
    //   fileAssociations: [".phd"],
    // },
  },

  profile: {
    appId: "inc.powerhouse.desktop.flagged-app",
    name: "flagged-app Desktop",
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
            // The user's .ph tree, same names as the project's: ${userData}
            // resolves at the runner — the project root in the CLI, the OS
            // profile dir in a shell (PH_USER_DATA_DIR). The reactor store is
            // named here for clarity; the read model (.ph/read-storage),
            // identity and run records follow the same root by default.
            // NEVER point readModel at this dir: two PGlite instances on one
            // data dir corrupt it (the runner refuses the declaration).
            storage: {
              kind: "path",
              dataDir: "${userData}/.ph/reactor-storage",
            },
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
          remote: { url: `http://127.0.0.1:${serverPort}/d/${d.slug}` },
        })),
      },
    },
  },
};
