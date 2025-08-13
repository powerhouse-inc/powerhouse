import dotenv from "dotenv";
dotenv.config();

import { getConfig } from "@powerhousedao/config/utils";
const phConfig = getConfig();
const { switchboard } = phConfig;
interface Config {
  database: {
    url: string;
  };
  port: number;
  mcp: boolean;
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
};
