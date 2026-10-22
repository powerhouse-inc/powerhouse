// 2.1 member roles: no folder-keyed wiring. The connect member does not get
// the switchboard's drives because its folder is named "connect".
export default {
  name: "inv-roles",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  config: { projectDrivesIntoConnect: true },
  children: {
    switchboard: { host: "switchboard" },
    connect: { host: "connect" },
  },
};
