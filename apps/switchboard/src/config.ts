import dotenv from "dotenv";
dotenv.config();

import { getConfig } from "@powerhousedao/config/node";
import type { DriveInput } from "document-drive";
const phConfig = getConfig();
const { switchboard } = phConfig;
interface Config {
  database: {
    url: string;
  };
  port: number;
  mcp: boolean;
  drive: DriveInput;
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
