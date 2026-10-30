// Cells: generic compound, members, two members of ONE host (tokens pick one
// with `member`), the plan from tokens (no startOrder), cspRegistrySync
// forwarded by runner (the connect-runner member in folder "ui" gets it; the
// switchboard members' strict runner would reject it).
export default {
  name: "lab-studio",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  config: { cspRegistrySync: true },
  children: {
    ui: {
      host: "ui",
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  member: "sb-b",
                  path: ["drives", "lab", "url"],
                },
              },
            },
          },
        },
      },
    },
    "sb-a": { host: "switchboard" },
    "sb-b": { host: "switchboard", runner: { port: 4002 } },
  },
};
