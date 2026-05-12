// Allowlists transitive postinstall scripts so `pnpm install` does not fail
// under pnpm 11's `strict-dep-builds=true` (which promotes the
// ERR_PNPM_IGNORED_BUILDS warning to an error). pnpm 10 also reads this map.
export const pnpmWorkspaceTemplate = `allowBuilds:
  "@apollo/protobufjs": true
  "@parcel/watcher": true
  esbuild: true
  protobufjs: true
  @datadog/pprof: true
`;
