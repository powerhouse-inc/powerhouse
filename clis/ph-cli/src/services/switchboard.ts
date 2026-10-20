import type {
  IdentityOptions,
  StartServerOptions,
} from "@powerhousedao/switchboard/server";
import { DEFAULT_DRIVE_ICON } from "@powerhousedao/shared/clis";
import { startSwitchboard as startSwitchboardServer } from "@powerhousedao/switchboard/server";
import type { ILogger } from "document-model";
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

// No `dbPath` default here: the classic commands always carry the parsed
// `dbPath` key (undefined without --db-path) and so always overrode it — the
// server's own split defaults (`.ph/reactor-storage` for the reactor,
// `.ph/read-storage` for the read model) are the legacy layout. A default
// here resurfaces for any caller that omits the key and then names ONE dir
// for both PGlite stores (two writers on one PGDATA).
export const defaultSwitchboardOptions = {
  port: 4001,
  drive: {
    id: "powerhouse",
    slug: "powerhouse",
    global: {
      name: "Powerhouse",
      icon: DEFAULT_DRIVE_ICON,
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
  options: Omit<SwitchboardArgs, "mcp"> & {
    /** A declared composition (R2) leaves this unset: the mcp plugin's presence sets it. */
    mcp?: boolean;
    /** `undefined` suppresses the default drive (declared drives replace it). */
    drive?: StartServerOptions["drive"];
    strictPort?: boolean;
    processorConfig?: Map<string, unknown>;
    /** False under a supervising compound, which owns SIGINT/SIGTERM. */
    signalHandlers?: boolean;
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
