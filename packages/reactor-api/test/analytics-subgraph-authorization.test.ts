import { describe, expect, it } from "vitest";
import { AnalyticsSubgraph } from "../src/graphql/analytics-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";
import { contextFor, OUTSIDER } from "./utils/read-gate-fixture.js";

const ADMIN = "0xadmin";

function analytics(policy: AuthorizationPolicy) {
  const subgraph = new AnalyticsSubgraph({
    analyticsStore: {},
    graphqlManager: { setAdditionalContextFields: () => undefined },
    authorizationService: createAuthorizationService(
      { admins: [ADMIN], defaultProtection: false, policy },
      {} as DocumentPermissionService,
      () => Promise.resolve([]),
    ),
  } as unknown as SubgraphArgs);
  const resolve = (
    subgraph.resolvers.Query as Record<
      string,
      (p: unknown, a: unknown, c: Context) => unknown
    >
  ).analytics;
  return (address?: string) => resolve(undefined, {}, contextFor(address));
}

describe("analytics subgraph authorization", () => {
  it("serves anyone under OPEN", () => {
    const query = analytics(AuthorizationPolicy.OPEN);

    expect(query()).toEqual({});
    expect(query(OUTSIDER)).toEqual({});
  });

  it.each([
    AuthorizationPolicy.ADMIN_ONLY,
    AuthorizationPolicy.DOCUMENT_PERMISSIONS,
  ])("serves only an admin under %s", (policy) => {
    const query = analytics(policy);

    expect(() => query()).toThrow(/authenticat/i);
    expect(() => query(OUTSIDER)).toThrow(/forbidden|permission/i);
    expect(query(ADMIN)).toEqual({});
  });
});
