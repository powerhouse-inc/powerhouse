import type {
  IdentityOptions,
  StartServerOptions,
} from "@powerhousedao/switchboard/server";
import { startSwitchboard as startSwitchboardServer } from "@powerhousedao/switchboard/server";
import path from "node:path";
import type { SwitchboardArgs } from "../types.js";

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

export async function startSwitchboard(options: SwitchboardArgs) {
  const {
    packages: packagesString,
    remoteDrives,
    useVetraDrive,
    vetraDriveId,
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

  const packages = packagesString?.split(",");

  // Only include the default drive if no remote drives are provided
  const finalOptions =
    remoteDrives.length > 0
      ? {
          ...defaultOptions,
          drive: undefined, // Don't create default drive when syncing with remote
          ...serverOptions,
          remoteDrives,
          identity,
          packages,
        }
      : {
          ...defaultOptions,
          ...serverOptions,
          remoteDrives,
          identity,
          packages,
        };

  const reactor = await startSwitchboardServer(finalOptions);

  return reactor;
}
