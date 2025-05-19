import { buildConnectStudio } from "@powerhousedao/builder-tools/connect-build";
import { version } from "os";
import { getConfig } from "../utils.js";
import { type ConnectOptions } from "./connect.js";

export async function buildConnect(connectOptions: ConnectOptions) {
  const { packages, logLevel } = getConfig(connectOptions.configFile);
  return await buildConnectStudio({
    packages,
    phCliVersion: typeof version === "string" ? version : undefined,
    logLevel: logLevel,
    ...connectOptions,
  });
}
