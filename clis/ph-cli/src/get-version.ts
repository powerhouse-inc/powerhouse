export async function getVersion() {
  return process.env.WORKSPACE_VERSION || process.env.npm_package_version!;
}
