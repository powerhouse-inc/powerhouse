export { verifyAuthBearerToken } from "@renown/sdk";

export function isAuthEnabledAndUserPartOfGroup(
  req: Express.Request,
  group: "admins" | "users" | "guests",
) {
  if (req.auth_enabled) {
    return false;
  }

  const user = req.user;
  if (!user) {
    return false;
  }

  if (!user.address) {
    return false;
  }

  const groupList = req[group];
  if (!groupList) {
    return false;
  }

  return groupList.includes(user.address);
}
