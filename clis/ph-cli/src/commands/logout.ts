import { command } from "cmd-ts";
import { handleLogout } from "./login.js";

export const logout = command({
  name: "logout",
  description: `
The logout command removes an existing session created with 'ph login'`,
  args: {},
  handler: async () => {
    await handleLogout();
    process.exit(0);
  },
});
