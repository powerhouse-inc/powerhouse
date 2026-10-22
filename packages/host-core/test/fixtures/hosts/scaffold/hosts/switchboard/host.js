// @ts-check
import config from "../../powerhouse.config.json" with { type: "json" };

/** @satisfies {PHHost} */
export default {
  name: "my-project-switchboard",

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

  // `auth` is read from powerhouse.config.json by the server itself.
  // `protocol` is SINGLE-SOURCED: this references the same connect.reactor
  // block of powerhouse.config.json that the connect host receives via its
  // config — one store for the replay/admission consensus, projected here
  // onto the server's REACTOR_* / CREATE_SIGNATURE_POLICY env. A pre-set env
  // var contradicting it fails boot by name.
  reactor: {
    protocol: config.connect?.reactor ?? {},
    // The drive this switchboard serves. The cli/desktop compounds read this
    // list and point Connect at it (as a remote client / remote drive), so
    // the drive is OWNED in exactly one place.
    drives: [{ slug: "powerhouse", name: "my-project" }],
  },
};
