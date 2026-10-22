// @ts-check
// Static projection of powerhouse.config.json — only that import is allowed;
// runtime behavior lives in the runner module named below.
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  name: "flagged-app-connect",

  // `ph run connect` (sugar: `ph connect` once hosts are active) imports
  // and calls this module. Options here are consumed by the runner and never
  // emitted into the runtime config.
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    port: config.studio?.port ?? 3000, // referenced — the value stays in powerhouse.config.json

    // THE COMPOSITION — presence is activation (no feature flags behind
    // these lines). The generic shell is Connect's chrome: sidebar, home,
    // /d/ URLs, drive management. It OWNS the drive-chrome toggles — passed in
    // its `config` here. Removing the entry turns those toggles OFF (live
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
    appId: "inc.powerhouse.connect.flagged-app",
    name: "flagged-app",
  },

  // Standalone Connect runs its OWN reactor (reactorClient derived from the
  // backends below — a lone `worker` backend → the worker reactor, PGlite in
  // a SharedWorker). The default drive lives in the tab's reactor. The
  // cli/desktop compounds re-point this same drive at the switchboard instead
  // — see those hosts. `protocol` is single-sourced from the connect.reactor
  // block both this host and the switchboard read, so they cannot diverge.
  reactor: {
    protocol: config.connect?.reactor ?? {},
    backends: {
      main: { kind: "in-process" },
    },
    drives: [{ slug: "powerhouse", name: "flagged-app" }],
  },
};
