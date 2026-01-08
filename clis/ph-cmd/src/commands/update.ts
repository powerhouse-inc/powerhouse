import { getPackageVersion } from "@powerhousedao/codegen/file-builders";
import { command, run } from "cmd-ts";
import { detect } from "detect-package-manager";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";
import { runCmd } from "../utils/run-cmd.js";

const ALL_POWERHOUSE_DEPENDENCIES = [
  "@powerhousedao/connect",
  "@powerhousedao/switchboard",
  "@powerhousedao/ph-cli",
  "ph-cmd",
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "@powerhousedao/common",
  "@powerhousedao/config",
  "@powerhousedao/design-system",
  "document-drive",
  "document-model",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-local",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/switchboard-gui",
  "@powerhousedao/vetra",
];

function getTagFromVersion(version: string) {
  if (version.includes("dev")) return "dev";
  if (version.includes("staging")) return "staging";
  return "latest";
}

function logVersionUpdate(args: {
  name: string;
  version: string;
  newVersion: string;
}) {
  const { name, version, newVersion } = args;
  console.log(`Updating ${name}: ${version} -> ${newVersion}`);
}

const commandParser = command({
  name: "ph update",
  description:
    "Update your powerhouse dependencies to their latest tagged version",
  args: {},
  handler: async () => {
    console.log(`Updating Powerhouse dependencies...`);
    const packageJson = await readPackage();

    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await getPackageVersion({ name, tag });
          packageJson.dependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    if (packageJson.devDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.devDependencies,
      )) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await getPackageVersion({ name, tag });
          packageJson.devDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    if (packageJson.optionalDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.optionalDependencies,
      )) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await getPackageVersion({ name, tag });
          packageJson.optionalDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    if (packageJson.peerDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.peerDependencies,
      )) {
        if (version && ALL_POWERHOUSE_DEPENDENCIES.includes(name)) {
          const tag = getTagFromVersion(version);
          const newVersion = await getPackageVersion({ name, tag });
          packageJson.peerDependencies[name] = newVersion;
          logVersionUpdate({
            name,
            version,
            newVersion,
          });
        }
      }
    }

    await writePackage(packageJson);

    const packageManager = await detect();

    console.log(`Installing updated dependencies with \`${packageManager}\``);
    runCmd(`${packageManager} install`);
  },
});

export async function update(args: string[]) {
  await run(commandParser, args);
}
