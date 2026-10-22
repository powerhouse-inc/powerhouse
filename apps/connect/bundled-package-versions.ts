import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const versionOf = (name: string) =>
  JSON.stringify(
    (require(`${name}/package.json`) as { version: string }).version,
  );

/** `define` constants for the packages Connect bundles: importing their
 * package.json for the version would ship the whole file. */
export const bundledPackageVersions = {
  PH_COMMON_PACKAGE_VERSION: versionOf(
    "@powerhousedao/powerhouse-vetra-packages",
  ),
  PH_VETRA_PACKAGE_VERSION: versionOf("@powerhousedao/vetra"),
  PH_WORKFLOW_PACKAGE_VERSION: versionOf("@powerhousedao/workflow"),
};
