// Cells: connect, in-process client, memory storage, local drive, verb `dev`.
export default {
  name: "lab-connect-memory",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    defaultVerb: "dev",
    port: 3000,
  },
  reactor: {
    backends: { main: { kind: "in-process", storage: { kind: "memory" } } },
    drives: [{ slug: "scratch", name: "Scratch" }],
  },
};
