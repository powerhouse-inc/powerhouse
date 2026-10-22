// PENDING T4-A ($map). Cells: the desktop runner (compound kind), a
// switchboard member at `run` and a connect member at `serve` whose drives
// are the switchboard's drives attached as remotes through `$map`, next to
// its own local worker reactor (router client).
export default {
  name: "lab-desktop",
  runner: { module: "@powerhousedao/desktop/runner" },
  config: { startOrder: ["desktop-switchboard", "desktop-connect"] },
  children: {
    "desktop-switchboard": { host: "switchboard" },
    "desktop-connect": {
      host: "connect-worker-idb",
      runner: { defaultVerb: "serve" },
      reactor: {
        backends: {
          main: { kind: "worker", storage: { kind: "idb" } },
          sb: {
            kind: "remote",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["endpoints", "graphql"],
                },
              },
            },
          },
        },
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: {
              slug: { $key: true },
              remote: { url: { $item: ["url"] } },
            },
          },
        },
      },
    },
  },
};
