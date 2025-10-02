import type { ConnectStudioOptions } from "@powerhousedao/builder-tools";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};
const version = packageJson.version;
export type ConnectOptions = ConnectStudioOptions;

export async function startConnect(connectOptions: ConnectOptions) {
  throw Error("NotImplemented");
  // const { packages, studio, logLevel } = getConfig(connectOptions.configFile);
  // return await startConnectStudio({
  //   port: studio?.port?.toString() || undefined,
  //   packages,
  //   phCliVersion: typeof version === "string" ? version : undefined,
  //   open: studio?.openBrowser,
  //   logLevel: logLevel,
  //   ...connectOptions,
  // });
}
