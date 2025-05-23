import dotenv from "dotenv";
dotenv.config();

import { getConfig } from "@powerhousedao/config/utils";
const phConfig = getConfig();
const { switchboard: { auth: { enabled, guests, users, admins } = {} } = {} } =
  phConfig;
interface Config {
  auth: {
    enabled: boolean;
    guests: string[];
    users: string[];
    admins: string[];
  };
}
export const config: Config = {
  auth: {
    enabled:
      process.env.SWITCHBOARD_AUTH_ENABLED === "true"
        ? true
        : (enabled ?? false),
    guests: process.env.SWITCHBOARD_AUTH_GUESTS
      ? process.env.SWITCHBOARD_AUTH_GUESTS.split(",")
      : (guests ?? []),
    users: process.env.SWITCHBOARD_AUTH_USERS
      ? process.env.SWITCHBOARD_AUTH_USERS.split(",")
      : (users ?? []),
    admins: process.env.SWITCHBOARD_AUTH_ADMINS
      ? process.env.SWITCHBOARD_AUTH_ADMINS.split(",")
      : (admins ?? []),
  },
};
