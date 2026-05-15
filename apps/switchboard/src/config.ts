import dotenv from "dotenv";
dotenv.config();

import { getConfig } from "@powerhousedao/config/node";
import { parseForcePgVersion } from "./pglite-version.js";
import type {
  SwitchboardDriveDocumentType,
  SwitchboardDriveInput,
} from "./types.js";
const phConfig = getConfig();
const { switchboard } = phConfig;
interface Config {
  database: {
    url: string;
  };
  port: number;
  mcp: boolean;
  migratePglite: boolean;
  forcePgVersion: 16 | 17 | null;
  drive: SwitchboardDriveInput;
}

function parseDriveType(
  raw: string | undefined,
): SwitchboardDriveDocumentType | undefined {
  if (!raw) return undefined;
  if (raw === "powerhouse/document-drive" || raw === "powerhouse/reactor-drive")
    return raw;
  throw new Error(
    `Invalid PH_DEFAULT_DRIVE_TYPE: ${raw}. Expected "powerhouse/document-drive" or "powerhouse/reactor-drive".`,
  );
}

export const config: Config = {
  database: {
    // url: process.env.PH_SWITCHBOARD_DATABASE_URL ?? switchboard?.database?.url ?? "dev.db",
    url:
      process.env.PH_SWITCHBOARD_DATABASE_URL ??
      switchboard?.database?.url ??
      "dev.db",
  },
  port:
    process.env.PH_SWITCHBOARD_PORT &&
    !isNaN(Number(process.env.PH_SWITCHBOARD_PORT))
      ? Number(process.env.PH_SWITCHBOARD_PORT)
      : (switchboard?.port ?? 4001),
  mcp: true,
  migratePglite: process.env.PH_MIGRATE_PGLITE === "true",
  forcePgVersion: parseForcePgVersion(process.env.PH_FORCE_PG_VERSION),
  drive: {
    id: "powerhouse",
    slug: "powerhouse",
    documentType: parseDriveType(process.env.PH_DEFAULT_DRIVE_TYPE),
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
