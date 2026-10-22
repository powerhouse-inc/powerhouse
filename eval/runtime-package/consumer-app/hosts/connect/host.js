export default {
  name: "connect",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3415 },
  config: {
    drives: {
      defaultDrives: [
        { url: "http://localhost:4415/d/MoSUAHFBf72hV5hZRmecdwOCF5oumwlyZWUNjzNmqJc", name: "Warehouse" },
      ],
    },
  },
};
