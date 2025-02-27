import { ConnectStudioOptions } from "@powerhousedao/builder-tools/connect-studio";
import { blue, green, red } from "colorette";
import { Command } from "commander";
import { ChildProcessWithoutNullStreams, fork } from "node:child_process";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CommandActionType } from "../types.js";
import { getConfig } from "../utils.js";
import {
  DefaultSwitchboardOptions,
  SwitchboardOptions,
} from "./switchboard.js";

const __dirname =
  import.meta.dirname || dirname(fileURLToPath(import.meta.url));

function spawnLocalSwitchboard(options?: SwitchboardOptions) {
  const child = fork(
    path.join(__dirname, "switchboard.js"),
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
        process.stdout.write(blue(`[Switchboard]: ${line}\n`));
      }
    });

    child.stderr.on("error", (data: Buffer) => {
      process.stderr.write(red(`[Switchboard]: ${data.toString()}`));
    });
    child.on("error", (err) => {
      process.stderr.write(red(`[Switchboard]: ${err}`));
    });

    child.on("exit", (code) => {
      console.log(`Switchboard process exited with code ${code}`);
    });
  });
}

async function spawnConnect(
  options?: ConnectStudioOptions,
  localReactorUrl?: string,
) {
  const child = fork(
    path.join(__dirname, "connect.js"),
    ["spawn", JSON.stringify(options ?? {})],
    {
      silent: true,
      env: {
        ...process.env,
        // TODO add studio variables?
        LOCAL_DOCUMENT_MODELS: options?.localDocuments,
        LOCAL_DOCUMENT_EDITORS: options?.localEditors,
        PH_CONNECT_DEFAULT_DRIVES_URL: localReactorUrl,
      },
    },
  ) as ChildProcessWithoutNullStreams;

  return new Promise<void>((resolve) => {
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
      generate?: boolean;
      watch?: boolean;
      switchboardPort?: number;
      configFile?: string;
      httpsKeyFile?: string;
      httpsCertFile?: string;
    },
  ]
> = async ({
  generate,
  watch,
  switchboardPort = DefaultSwitchboardOptions.port,
  configFile,
}) => {
  try {
    const baseConfig = getConfig(configFile);
    const https = baseConfig.reactor?.https;
    const { driveUrl } = await spawnLocalSwitchboard({
      generate,
      port: switchboardPort,
      watch,
      https,
    });
    await spawnConnect({ configFile }, driveUrl);
  } catch (error) {
    console.error(error);
  }
};

export function devCommand(program: Command) {
  program
    .command("dev")
    .description("Starts dev environment")
    .option("--generate", "generate code when document model is updated")
    .option("--switchboard-port <port>", "port to use for the switchboard")
    .option("--https-key-file <HTTPS_KEY_FILE>", "path to the ssl key file")
    .option("--https-cert-file <HTTPS_CERT_FILE>", "path to the ssl cert file")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
    )
    .option(
      "-w, --watch",
      "if the switchboard should watch for local changes to document models and processors",
    )
    .action(dev);
}
