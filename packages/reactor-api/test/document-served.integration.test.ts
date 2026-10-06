import type {
  InProcessReactorClientModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  data?: { documentServed?: boolean } | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

const QUERY = /* GraphQL */ `
  query GetDocumentServed($idOrSlug: String!, $view: ViewFilterInput) {
    documentServed(idOrSlug: $idOrSlug, view: $view)
  }
`;

async function documentServed(
  server: ReactorHttpServer,
  idOrSlug: string,
  options: { bearer?: string; view?: { branch?: string } } = {},
): Promise<GraphQLResponse> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { idOrSlug, view: options.view },
    }),
  });
  return (await response.json()) as GraphQLResponse;
}

async function served(
  server: ReactorHttpServer,
  idOrSlug: string,
  options: { bearer?: string; view?: { branch?: string } } = {},
): Promise<boolean | undefined> {
  const response = await documentServed(server, idOrSlug, options);
  expect(response.errors).toBeUndefined();
  return response.data?.documentServed;
}

describe("Query.documentServed", () => {
  let module: InProcessReactorClientModule;
  let server: ReactorHttpServer;
  let secret: string;
  let open: string;

  beforeAll(async () => {
    module = await buildReadGateReactor();
    secret = await createFixture(module.client, "ds-secret");
    await police(module.client, secret);
    open = await createFixture(module.client, "ds-open");
    server = await startReactorHttpServer(module.client, openAuthorization);
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
  });

  it("serves a readable document", async () => {
    expect(await served(server, open)).toBe(true);
    expect(await served(server, open, { bearer: OUTSIDER })).toBe(true);
  });

  it("answers false for a document whose every domain scope is refused", async () => {
    expect(await served(server, secret)).toBe(false);
    expect(await served(server, secret, { bearer: OUTSIDER })).toBe(false);
    expect(await served(server, secret, { bearer: READER })).toBe(true);
  });

  it("differs from the document query, which serves such a document's header", async () => {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OUTSIDER}`,
      },
      body: JSON.stringify({
        query: `query { document(idOrSlug: "${secret}") { document { id } } }`,
      }),
    });
    const body = (await response.json()) as {
      data?: { document?: { document: { id: string } } };
    };

    expect(body.data?.document?.document.id).toBe(secret);
    expect(await served(server, secret, { bearer: OUTSIDER })).toBe(false);
  });

  it("agrees with the reactor client's own isServed", async () => {
    for (const address of [undefined, OUTSIDER, READER]) {
      const subject = address ? { address } : {};
      for (const id of [open, secret]) {
        expect(await served(server, id, { bearer: address })).toBe(
          await module.client.isServed(id, { subject }),
        );
      }
    }
  });

  it("answers false for an absent document", async () => {
    expect(await served(server, "no-such-document")).toBe(false);
  });

  it("honours the view's branch", async () => {
    expect(await served(server, open, { view: { branch: "main" } })).toBe(true);
    expect(
      await served(server, open, { view: { branch: "no-such-branch" } }),
    ).toBe(false);
  });
});

describe("Query.documentServed when the reactor cannot decide", () => {
  let module: InProcessReactorClientModule;
  let server: ReactorHttpServer;

  beforeAll(async () => {
    module = await buildReadGateReactor();
    const failing = new Proxy(module.client, {
      get(target, property, receiver) {
        if (property === "isServed") {
          return () => Promise.reject(new Error("storage unavailable"));
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as IReactorClient;
    server = await startReactorHttpServer(failing, openAuthorization);
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
  });

  it("answers with an error, not false", async () => {
    const response = await documentServed(server, "anything");

    expect(response.data).toBeNull();
    expect(response.errors?.[0]?.message).toContain("storage unavailable");
  });
});

describe("Query.documentServed under the host's legacy permissions", () => {
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
    secret = await createFixture(module.client, "ds-legacy");
    await police(module.client, secret);
    server = await startReactorHttpServer(module.client, legacyRefusesEveryone);
  });

  afterAll(async () => {
    await server.close();
    module.reactor.kill();
  });

  it("answers false when the host refuses a document the reactor would serve", async () => {
    expect(await served(server, secret, { bearer: READER })).toBe(false);
  });
});
