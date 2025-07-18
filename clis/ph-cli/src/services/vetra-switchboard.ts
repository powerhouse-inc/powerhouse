import { getConfig } from "@powerhousedao/config/utils";
import {
  type StartServerOptions,
  startSwitchboard as startSwitchboardServer,
} from "@powerhousedao/switchboard/server";
import path from "node:path";

const defaultVetraSwitchboardOptions: Partial<StartServerOptions> = {
  port: 4001,
  dbPath: path.join(process.cwd(), ".ph/read-model.db"),
  drive: {
    id: "vetra",
    slug: "vetra",
    global: {
      name: "Vetra",
      icon: "https://ipfs.io/ipfs/QmcaTDBYn8X2psGaXe7iQ6qd8q6oqHLgxvMX9yXf7f9uP7",
    },
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public",
      triggers: [],
    },
  },
};

export async function startVetraSwitchboard(options: StartServerOptions) {
  const baseConfig = getConfig(options.configFile);

  const { https } = baseConfig.reactor ?? { https: false };

  const reactor = await startSwitchboardServer({
    ...defaultVetraSwitchboardOptions,
    ...options,
    https,
  });

  return reactor;
}