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
    enabled: Boolean(process.env.SWITCHBOARD_AUTH_ENABLED) || false,
    guests: (process.env.SWITCHBOARD_AUTH_GUESTS || "").split(","),
    users: (process.env.SWITCHBOARD_AUTH_USERS || "").split(","),
    admins: (process.env.SWITCHBOARD_AUTH_ADMINS || "").split(","),
  },
};
