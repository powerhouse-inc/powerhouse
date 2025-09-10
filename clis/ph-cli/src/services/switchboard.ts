import { getConfig } from "@powerhousedao/config/utils";
import type { StartServerOptions } from "@powerhousedao/switchboard/server";
import { startSwitchboard as startSwitchboardServer } from "@powerhousedao/switchboard/server";
import path from "node:path";

const defaultSwitchboardOptions: Partial<StartServerOptions> = {
  port: 4001,
  dbPath: path.join(process.cwd(), ".ph/read-model.db"),
  drive: {
    id: "powerhouse",
    slug: "powerhouse",
    global: {
      name: "Powerhouse",
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

const defaultVetraSwitchboardOptions: Partial<StartServerOptions> = {
  port: 4001,
  dbPath: path.join(process.cwd(), ".ph/read-model.db"),
  drive: {
    id: "vetra",
    slug: "vetra",
    global: {
      name: "Vetra",
      icon: "https://azure-elderly-tortoise-212.mypinata.cloud/ipfs/bafkreibf2xokjqqtomqjd2w2xxmmhvogq4262csevclxh6sbrjgmjfre5u",
    },
    preferredEditor: "vetra-drive-app",
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public",
      triggers: [],
    },
  },
};

type SwitchboardOptions = StartServerOptions & {
  remoteDrives?: string[];
  useVetraDrive?: boolean;
};

export async function startSwitchboard(options: SwitchboardOptions) {
  const baseConfig = getConfig(options.configFile);
  const { https } = baseConfig.reactor ?? { https: false };
  const {
    remoteDrives = [],
    useVetraDrive = false,
    ...serverOptions
  } = options;

  // Choose the appropriate default configuration
  const defaultOptions = useVetraDrive
    ? defaultVetraSwitchboardOptions
    : defaultSwitchboardOptions;

  // Only include the default drive if no remote drives are provided
  const finalOptions =
    remoteDrives.length > 0
      ? {
          ...defaultOptions,
          drive: undefined, // Don't create default drive when syncing with remote
          ...serverOptions,
          https,
          remoteDrives,
        }
      : {
          ...defaultOptions,
          ...serverOptions,
          https,
          remoteDrives,
        };

  const reactor = await startSwitchboardServer(finalOptions);

  return reactor;
}
