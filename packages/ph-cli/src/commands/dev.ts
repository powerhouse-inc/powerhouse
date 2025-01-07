import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  spawn,
  fork,
  ChildProcessWithoutNullStreams,
} from "node:child_process";
import { Command } from "commander";
import { blue, green, red } from "colorette";
import { CommandActionType } from "../types.js";
import { DefaultReactorOptions, type ReactorOptions } from "./reactor.js";
import { getConfig } from "../utils.js";

const CONNECT_BIN_PATH = "node_modules/.bin/connect";
const __dirname =
  import.meta.dirname || dirname(fileURLToPath(import.meta.url));

function spawnLocalReactor(options?: ReactorOptions) {
  const child = fork(
    path.join(__dirname, "reactor.js"),
    ["spawn", JSON.stringify(options)],
    { silent: true },
  ) as ChildProcessWithoutNullStreams;

  return new Promise<{ driveUrl: string }>((resolve) => {
    child.on("message", (message) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const text = message.toString();

      if (text.startsWith("driveUrl:")) {
        const driveUrl = text.substring("driveUrl:".length);
        resolve({ driveUrl });
      }
    });
    child.stdout.on("data", (data: Buffer) => {
      const message = data.toString();
      const lines = message.split("\n").filter((line) => line.trim().length);
      for (const line of lines) {
        process.stdout.write(blue(`[Reactor]: ${line}\n`));
      }
    });

    child.stderr.on("error", (data: Buffer) => {
      process.stderr.write(red(`[Reactor]: ${data.toString()}`));
    });
    child.on("error", (err) => {
      process.stderr.write(red(`[Reactor]: ${err}`));
    });

    child.on("close", (code) => {
      console.log(`Reactor process exited with code ${code}`);
    });
  });
}

async function spawnConnect(
  projectPath?: string,
  options?: {
    localDocumentModels?: string;
    localEditors?: string;
    localReactorUrl?: string;
  },
) {
  let binPath = path.join(projectPath || ".", "node_modules/.bin/connect");
  if (!fs.existsSync(binPath)) {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("@powerhousedao/connect/package.json");
    const packageDir = path.dirname(packagePath);

    binPath = path.join(packageDir, CONNECT_BIN_PATH);
  }

  return new Promise<void>((resolve) => {
    const child = spawn(binPath, {
      shell: true,
      env: {
        ...process.env,
        // TODO add studio variables?
        LOCAL_DOCUMENT_MODELS: options?.localDocumentModels,
        LOCAL_DOCUMENT_EDITORS: options?.localEditors,
        PH_CONNECT_DEFAULT_DRIVES_URL: options?.localReactorUrl,
      },
    });

    child.stdout.on("data", (data: Buffer) => {
      resolve();
      process.stdout.write(green(`[Connect]: ${data.toString()}`));
    });

    child.stderr.on("data", (data: Buffer) => {
      process.stderr.write(red(`[Connect]: ${data.toString()}`));
    });

    child.on("close", (code) => {
      console.log(`Connect process exited with code ${code}`);
    });
  });
}

export const dev: CommandActionType<
  [
    {
      projectPath?: string;
      generate?: boolean;
      watch?: boolean;
      reactorPort?: number;
    },
  ]
> = async ({
  projectPath,
  generate,
  watch,
  reactorPort = DefaultReactorOptions.port,
}) => {
  try {
    const config = getConfig();
    const { driveUrl } = await spawnLocalReactor({
      generate,
      port: reactorPort,
      watch,
    });
    await spawnConnect(projectPath, {
      localDocumentModels: config.documentModelsDir,
      localEditors: config.editorsDir,
      localReactorUrl: driveUrl,
    });
  } catch (error) {
    console.error(error);
  }
};

export function devCommand(program: Command) {
  program
    .command("dev")
    .description("Starts dev environment")
    .option("--project-path <type>", "path to the project")
    .option("--generate", "generate code when document model is updated")
    .option("--reactor-port <port>", "port to use for the reactor")
    .option(
      "-w, --watch",
      "if the reactor should watch for local changes to document models and processors",
    )
    .action(dev);
}
