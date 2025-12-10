import { getConfig } from "@powerhousedao/config/node";
import type {
  IdentityOptions,
  StartServerOptions,
} from "@powerhousedao/switchboard/server";
import { startSwitchboard as startSwitchboardServer } from "@powerhousedao/switchboard/server";
import path from "node:path";

export type LocalSwitchboardOptions = StartServerOptions & {
  configFile?: string;
  generate?: boolean;
  watch?: boolean;
  basePath?: string;
  dbPath?: string;
  disableDefaultDrive?: boolean;
  remoteDrives?: string;
  remoteDrivesConfig?: string;
  /** Enable identity/authentication using keypair from ph login */
  useIdentity?: boolean;
  /** Path to custom keypair file */
  keypairPath?: string;
  /** Require existing keypair (fail if not found) */
  requireIdentity?: boolean;
};

export const defaultSwitchboardOptions = {
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
  mcp: true,
} satisfies StartServerOptions;

function getDefaultVetraSwitchboardOptions(
  vetraDriveId: string,
): Partial<StartServerOptions> {
  return {
    port: 4001,
    dbPath: path.join(process.cwd(), ".ph/read-model.db"),
    drive: {
      id: vetraDriveId,
      slug: vetraDriveId,
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
}

type SwitchboardOptions = StartServerOptions & {
  remoteDrives?: string[];
  useVetraDrive?: boolean;
  vetraDriveId?: string;
  /** Enable identity/authentication using keypair from ph login */
  useIdentity?: boolean;
  /** Path to custom keypair file */
  keypairPath?: string;
  /** Require existing keypair (fail if not found) */
  requireIdentity?: boolean;
};

export async function startSwitchboard(options: SwitchboardOptions) {
  const baseConfig = getConfig(options.configFile);
  const { https } = baseConfig.reactor ?? { https: false };
  const {
    remoteDrives = [],
    useVetraDrive = false,
    vetraDriveId = "vetra",
    useIdentity,
    keypairPath,
    requireIdentity,
    ...serverOptions
  } = options;

  // Choose the appropriate default configuration
  const defaultOptions = useVetraDrive
    ? getDefaultVetraSwitchboardOptions(vetraDriveId)
    : defaultSwitchboardOptions;

  // Build identity options if enabled
  const identity: IdentityOptions | undefined =
    useIdentity || keypairPath || requireIdentity
      ? {
          keypairPath,
          requireExisting: requireIdentity,
        }
      : undefined;

  // Only include the default drive if no remote drives are provided
  const finalOptions =
    remoteDrives.length > 0
      ? {
          ...defaultOptions,
          drive: undefined, // Don't create default drive when syncing with remote
          ...serverOptions,
          https,
          remoteDrives,
          identity,
        }
      : {
          ...defaultOptions,
          ...serverOptions,
          https,
          remoteDrives,
          identity,
        };

  const reactor = await startSwitchboardServer(finalOptions);

  return reactor;
}
