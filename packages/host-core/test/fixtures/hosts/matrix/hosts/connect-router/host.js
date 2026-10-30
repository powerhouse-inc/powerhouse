// Cells: connect, router client (structural multi-reactor: a local tab
// reactor plus the switchboard as a remote), a remote drive by output token
// and a remote drive by literal URL; the switchboard drive is placed there.
export default {
  name: "lab-connect-router",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3002 },
  reactor: {
    placement: { primary: "tab", drives: { lab: "sb" } },
    backends: {
      sb: {
        kind: "remote",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "lab", "url"] },
          },
        },
      },
      tab: { kind: "in-process", storage: { kind: "idb" } },
    },
    drives: [
      {
        slug: "lab",
        remote: {
          url: {
            $output: { host: "switchboard", path: ["drives", "lab", "url"] },
          },
        },
      },
      {
        slug: "public",
        remote: { url: "https://drives.example.com/d/public" },
      },
    ],
  },
};
