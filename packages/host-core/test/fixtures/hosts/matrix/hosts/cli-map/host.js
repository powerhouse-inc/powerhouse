// PENDING T4-A ($map). Cells: the 3.4 cli shape: Connect as a remote client
// of the switchboard member, attaching EVERY drive the switchboard reports
// (declared and plugin-created) through `$map` over its `drives` output,
// with the protocol restored next to the remote backend.
export default {
  name: "lab-cli",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: {
    "cli-switchboard": { host: "switchboard" },
    "cli-connect": {
      host: "ui",
      reactor: {
        protocol: { createSignaturePolicy: "v2-required" },
        backends: {
          sb: {
            kind: "remote",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "lab", "url"],
                },
              },
            },
          },
        },
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
          },
        },
      },
    },
  },
};
