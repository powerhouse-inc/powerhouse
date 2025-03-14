import {
  type ConnectStudioOptions,
  startConnectStudio,
} from "@powerhousedao/builder-tools/connect-studio";
import { getConfig } from "@powerhousedao/config/powerhouse";
import packageJson from "../../package.json" with { type: "json" };

const version = packageJson.version;
export type ConnectOptions = ConnectStudioOptions;

export async function startConnect(connectOptions: ConnectOptions) {
  const { documentModelsDir, editorsDir, packages, studio, logLevel } = getConfig(connectOptions.configFile);
  return await startConnectStudio({
    port: studio?.port?.toString() || undefined,
    packages,
    phCliVersion: typeof version === "string" ? version : undefined,
    localDocuments: documentModelsDir || undefined,
    localEditors: editorsDir || undefined,
    open: studio?.openBrowser,
    logLevel: logLevel,
    ...connectOptions,
  });
}
