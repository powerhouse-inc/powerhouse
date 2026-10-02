import type {
  IdentityOptions,
  StartServerOptions,
} from "@powerhousedao/switchboard/server";
import { startSwitchboard as startSwitchboardServer } from "@powerhousedao/switchboard/server";
import type { ILogger } from "document-model";
import path from "node:path";
import type { SwitchboardArgs } from "../types.js";
import { POWERHOUSE_DRIVE_ICON } from "../utils/drive-icons.js";

const EGRESS_ALLOW_ENV = "PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES";
const LOCALHOST_ADDRESSES = ["127.0.0.1/32", "::1/128"];

// Lets pieces reach services on this machine, keeping any addresses already set
export function allowLocalhostEgress(env: NodeJS.ProcessEnv = process.env) {
  const current = (env[EGRESS_ALLOW_ENV] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const missing = LOCALHOST_ADDRESSES.filter(
    (address) => !current.includes(address),
  );
  if (missing.length > 0)
    env[EGRESS_ALLOW_ENV] = [...current, ...missing].join(",");
}

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
        icon: POWERHOUSE_DRIVE_ICON,
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

export async function startSwitchboard(
  options: SwitchboardArgs & {
    strictPort?: boolean;
    processorConfig?: Map<string, unknown>;
  },
  logger?: ILogger,
) {
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

  // Vetra and dev mode run against local services
  if (useVetraDrive || serverOptions.dev) allowLocalhostEgress();

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
          logger,
        }
      : {
          ...defaultOptions,
          ...serverOptions,
          remoteDrives,
          identity,
          packages,
          logger,
        };

  const reactor = await startSwitchboardServer({
    ...finalOptions,
    fatalErrorShutdown: true,
  });

  return reactor;
}
