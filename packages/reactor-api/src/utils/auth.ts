export { verifyAuthBearerToken } from "@renown/sdk";

export function isAdmin(req: Express.Request): boolean {
  if (!req.auth_enabled) {
    return true;
  }

  const user = req.user;
  if (!user?.address) {
    return false;
  }

  return req.admins?.includes(user.address.toLowerCase()) ?? false;
}
