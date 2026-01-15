import type { SwitchboardReactor } from "@powerhousedao/switchboard/server";
import type { Command } from "commander";
import { switchboardHelp } from "../help.js";
import type { LocalSwitchboardOptions } from "../services/switchboard.js";
import type { CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startLocalSwitchboard(options: LocalSwitchboardOptions) {
  if (options.basePath) {
    process.env.BASE_PATH = options.basePath;
  }

  const Switchboard = await import("../services/switchboard.js");
  const { startSwitchboard } = Switchboard;

  // Extract only the props that switchboard expects
  const {
    port: rawPort,
    configFile,
    dev,
    dbPath,
    packages,
    useIdentity,
    keypairPath,
    requireIdentity,
  } = options;

  const port = typeof rawPort === "string" ? parseInt(rawPort) : rawPort;

  return startSwitchboard({
    port,
    configFile,
    dev,
    dbPath,
    packages,
    useIdentity,
    keypairPath,
    requireIdentity,
  });
}

export const runStartLocalSwitchboard: CommandActionType<
  [LocalSwitchboardOptions],
  Promise<SwitchboardReactor>
> = async (options) => {
  return await startLocalSwitchboard(options);
};

export function switchboardCommand(program: Command) {
  const command = program
    .command("switchboard")
    .alias("reactor")
    .description("Starts local switchboard")
    .option("--port <PORT>", "port to host the api", "4001")
    .option(
      "--config-file <configFile>",
      "Path to the powerhouse.config.js file",
      "./powerhouse.config.json",
    )
    .option("--generate", "generate code when document model is updated")
    .option("--dev", "enable development mode to load local packages")
    .option("--db-path <DB_PATH>", "path to the database")
    .option("--https-key-file <HTTPS_KEY_FILE>", "path to the ssl key file")
    .option("--https-cert-file <HTTPS_CERT_FILE>", "path to the ssl cert file")
    .option(
      "--packages <packages...>",
      "list of packages to be loaded, if defined then packages on config file are ignored",
    )
    .option(
      "--base-path <basePath>",
      "base path for the API endpoints (sets the BASE_PATH environment variable)",
    )
    .option("--mcp", "enable Mcp route at /mcp. Default: true")
    .option(
      "--use-identity",
      "enable identity using keypair from ph login (uses ~/.ph/keypair.json)",
    )
    .option("--keypair-path <path>", "path to custom keypair file for identity")
    .option(
      "--require-identity",
      "require existing keypair, fail if not found (implies --use-identity)",
    )
    .action(async (...args: [LocalSwitchboardOptions]) => {
      const { defaultDriveUrl, connectCrypto } = await runStartLocalSwitchboard(
        ...args,
      );
      console.log("   ➜  Switchboard:", defaultDriveUrl);
      if (connectCrypto) {
        const did = await connectCrypto.did();
        console.log("   ➜  Identity:", did);
      }
    });

  setCustomHelp(command, switchboardHelp);
}

if (process.argv.at(2) === "spawn") {
  const optionsArg = process.argv.at(3);
  const options = optionsArg
    ? (JSON.parse(optionsArg) as LocalSwitchboardOptions)
    : {};
  startLocalSwitchboard(options)
    .then((reactor) => {
      process.send?.(`driveUrl:${reactor.defaultDriveUrl}`);
    })
    .catch((e: unknown) => {
      throw e;
    });
}
