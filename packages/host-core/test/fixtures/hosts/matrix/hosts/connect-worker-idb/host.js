// Cells: connect, worker client, idb storage.
export default {
  name: "lab-connect-worker",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3001 },
  reactor: {
    backends: { main: { kind: "worker", storage: { kind: "idb" } } },
    drives: [{ slug: "notes", name: "Notes", preferredEditor: "notes-app" }],
  },
};
