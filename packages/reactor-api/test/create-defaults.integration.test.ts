import type { InProcessReactorClientModule } from "@powerhousedao/reactor";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  buildReadGateReactor,
  createFixture,
  openAuthorization,
  OUTSIDER,
  police,
  READER,
} from "./utils/read-gate-fixture.js";
import {
  startReactorHttpServer,
  type ReactorHttpServer,
} from "./utils/reactor-http-server.js";

type GraphQLResponse = {
  data?: {
    createDefaults?: {
      signaturePolicy: string;
      protocolVersions: Record<string, number>;
    };
  } | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

const QUERY = /* GraphQL */ `
  query GetCreateDefaults($parentIdOrSlug: String) {
    createDefaults(parentIdOrSlug: $parentIdOrSlug) {
      signaturePolicy
      protocolVersions
    }
  }
`;

async function createDefaults(
  server: ReactorHttpServer,
  parentIdOrSlug?: string,
  bearer?: string,
): Promise<GraphQLResponse> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ query: QUERY, variables: { parentIdOrSlug } }),
  });
  return (await response.json()) as GraphQLResponse;
}

function codeOf(response: GraphQLResponse): string | undefined {
  return response.errors?.[0]?.extensions?.code;
}

describe("Query.createDefaults", () => {
  let module: InProcessReactorClientModule;
  let server: ReactorHttpServer;
  let secret: string;

  beforeAll(async () => {
    module = await buildReadGateReactor();
    secret = await createFixture(module.client, "cd-secret");
    await police(module.client, secret);
    server = await startReactorHttpServer(module.client, openAuthorization);
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
  });

  it("answers with the reactor client's own defaults when no parent is named", async () => {
    const response = await createDefaults(server);

    expect(response.errors).toBeUndefined();
    expect(response.data?.createDefaults).toEqual({
      signaturePolicy: await module.client.getCreateSignaturePolicy(),
      protocolVersions: await module.client.getCreateProtocolVersions(),
    });
  });

  it("selects the protocol versions under the parent for a caller who may read it", async () => {
    const select = vi.spyOn(module.client, "getCreateProtocolVersions");
    try {
      const response = await createDefaults(server, secret, READER);

      expect(response.errors).toBeUndefined();
      expect(select).toHaveBeenCalledWith(secret);
      expect(response.data?.createDefaults?.protocolVersions).toEqual(
        await module.client.getCreateProtocolVersions(secret),
      );
    } finally {
      select.mockRestore();
    }
  });

  it("refuses a parent the reactor read gate withholds from the caller", async () => {
    const anonymous = await createDefaults(server, secret);
    const outsider = await createDefaults(server, secret, OUTSIDER);

    expect(anonymous.data).toBeNull();
    expect(codeOf(anonymous)).toBe("FORBIDDEN");
    expect(outsider.data).toBeNull();
    expect(codeOf(outsider)).toBe("FORBIDDEN");
  });

  it("refuses an unknown parent rather than answering as if none was named", async () => {
    const response = await createDefaults(server, "no-such-parent", READER);

    expect(response.data).toBeNull();
    expect(codeOf(response)).toBe("FORBIDDEN");
  });
});

describe("Query.createDefaults under the host's legacy permissions", () => {
  // The reactor would serve READER the parent; the host's own layer says no.
  const legacyRefusesEveryone: IAuthorizationService = {
    config: {
      admins: [],
      defaultProtection: true,
      policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
    },
    isSupremeAdmin: () => false,
    canCreate: () => true,
    canRead: () => Promise.resolve(false),
    canWrite: () => Promise.resolve(false),
    canManage: () => Promise.resolve(false),
    canMutate: () => Promise.resolve(false),
  };

  let module: InProcessReactorClientModule;
  let server: ReactorHttpServer;
  let secret: string;

  beforeAll(async () => {
    module = await buildReadGateReactor();
    secret = await createFixture(module.client, "cd-legacy");
    await police(module.client, secret);
    server = await startReactorHttpServer(module.client, legacyRefusesEveryone);
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
  });

  it("refuses the parent", async () => {
    const response = await createDefaults(server, secret, READER);

    expect(response.data).toBeNull();
    expect(codeOf(response)).toBe("FORBIDDEN");
  });
});
