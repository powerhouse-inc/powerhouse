import type { DocumentNode } from "graphql";
import {
  createPrivacyResolvers,
  type PrivacyAuthorization,
  type PrivacyResolverDeps,
} from "./resolvers.js";
import { typeDefs } from "./schema.js";

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

export type PrivacySubgraph = {
  name: string;
  typeDefs: DocumentNode;
  resolvers: ReturnType<typeof createPrivacyResolvers>;
};

function admitsAnonymous(authorizationService: PrivacyAuthorization): boolean {
  return (
    authorizationService.config.policy === "OPEN" ||
    authorizationService.isSupremeAdmin(undefined) ||
    authorizationService.isSupremeAdmin("")
  );
}

/** Throws PrivacySubgraphOpenPolicyError when anonymous callers are admins. */
export function createPrivacySubgraph(
  deps: PrivacyResolverDeps,
): PrivacySubgraph {
  if (admitsAnonymous(deps.authorizationService)) {
    throw new PrivacySubgraphOpenPolicyError(
      deps.authorizationService.config.policy,
    );
  }
  return {
    name: PRIVACY_SUBGRAPH_NAME,
    typeDefs,
    resolvers: createPrivacyResolvers(deps),
  };
}
