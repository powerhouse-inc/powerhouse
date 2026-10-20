// GAP (2.1 "a remote backend needs url"): `remote` itself is optional in the
// backend schema, so `kind: "remote"` with no `remote` block passes every
// schema; only the provisioning projection rejects it. Pinned so a schema fix
// shows up here.
export default {
  name: "lab-connect-no-url",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3006 },
  reactor: { backends: { sb: { kind: "remote" } } },
};
