import {
  generateArgs,
  getPackageManagerFromLockfile,
} from "@powerhousedao/ph-cli";
import { execSync } from "child_process";
import { command, run, subcommands } from "cmd-ts";
import { detect } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { checkout } from "./commands/checkout.js";
import { init } from "./commands/init.js";
import { setupGlobals } from "./commands/setup-globals.js";
import { update } from "./commands/update.js";
import { useLocal } from "./commands/use-local.js";
import { use } from "./commands/use.js";
import { getProjectInfo } from "./utils/package-manager.js";

const generate = command({
  name: "generate",
  description: "Generate powerhouse boilerplate code",
  args: generateArgs,
  handler: async () => {
    const detectResult = await detect();
    const packageManager = detectResult?.agent ?? "npm";
    const cmd = `${packageManager} ph-cli generate ${process.argv.slice(3).join(" ")}`;
    execSync(cmd, { stdio: "inherit" });
  },
});

const ph = (version: string) =>
  subcommands({
    name: "ph",
    version,
    description:
      "The Powerhouse CLI (ph-cmd) is a command-line interface tool that provides essential commands for managing Powerhouse projects.\nThe tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
    cmds: {
      init,
      use,
      update,
      "setup-globals": setupGlobals,
      "use-local": useLocal,
      generate,
      checkout,
    },
  });

const versionInfo = await getVersionInfo();

await run(ph(versionInfo), process.argv.slice(2));

async function getVersionInfo() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore build time version file
  const { version } = (await import("./version.js")) as { version: string };

  const phCliInfo = await getPhCliInfo();

  return `
-------------------------------------
PH CMD version: ${version}
${phCliInfo}
-------------------------------------
`.trim();
}

async function getPhCliInfo() {
  const projectInfo = await getProjectInfo(undefined, false);

  if (!projectInfo.available)
    return "PH CLI is not available, please run `ph setup-globals` to generate the default global project";

  const packageManager = getPackageManagerFromLockfile(projectInfo.path);

  const packageJson = await readPackage({ cwd: projectInfo.path });

  const phCliVersion =
    packageJson.dependencies?.["@powerhousedao/ph-cli"] ??
    packageJson.devDependencies?.["@powerhousedao/ph-cli"] ??
    "Not found";

  return `
PH CLI version: ${phCliVersion}
PH CLI path: ${projectInfo.path}
PH CLI is global project: ${projectInfo.isGlobal}
PH CLI package manager: ${packageManager}
`.trim();
}
