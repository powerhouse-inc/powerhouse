import dotenv from "dotenv";
dotenv.config();

import { getConfig } from "@powerhousedao/config/utils";
const phConfig = getConfig();
const { switchboard } = phConfig;
interface Config {
  auth: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
  };
  database: {
    url: string;
  };
  port: number;
}
export const config: Config = {
  auth: {
    enabled:
      process.env.SWITCHBOARD_AUTH_ENABLED === "true"
        ? true
        : (switchboard?.auth?.enabled ?? false),
    guests: process.env.SWITCHBOARD_AUTH_GUESTS
      ? process.env.SWITCHBOARD_AUTH_GUESTS.split(",")
      : (switchboard?.auth?.guests ?? []),
    users: process.env.SWITCHBOARD_AUTH_USERS
      ? process.env.SWITCHBOARD_AUTH_USERS.split(",")
      : (switchboard?.auth?.users ?? []),
    admins: process.env.SWITCHBOARD_AUTH_ADMINS
      ? process.env.SWITCHBOARD_AUTH_ADMINS.split(",")
      : (switchboard?.auth?.admins ?? []),
  },
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
};
