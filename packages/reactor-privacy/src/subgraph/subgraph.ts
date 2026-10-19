import type { PrivacyAuthorization } from "./resolvers.js";

export const PRIVACY_SUBGRAPH_NAME = "privacy";

/** Under OPEN every caller, anonymous included, is a supreme admin. */
export class PrivacySubgraphOpenPolicyError extends Error {
  constructor(readonly policy: string) {
    super(
      `The privacy subgraph is not mounted under policy ${policy}: it admits anonymous callers as admins`,
    );
    this.name = "PrivacySubgraphOpenPolicyError";
  }
}

/**
 * Throws PrivacySubgraphOpenPolicyError when anonymous callers are admins,
 * so a host never mounts the privacy subgraph under such a policy.
 */
export function refuseAnonymousAdmins(
  authorizationService: PrivacyAuthorization,
): void {
  if (
    authorizationService.config.policy === "OPEN" ||
    authorizationService.isSupremeAdmin(undefined) ||
    authorizationService.isSupremeAdmin("")
  ) {
    throw new PrivacySubgraphOpenPolicyError(
      authorizationService.config.policy,
    );
  }
}
