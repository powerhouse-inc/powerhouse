import {
  defineInitialAuthProvider,
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actionSignerIdentity,
  authAddress,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  referenceNote,
  referenceProfile,
} from "../../reactor/test/initial-auth/reference-app.js";
import { openAuthorization } from "./utils/read-gate-fixture.js";
import {
  startReactorHttpServer,
  type ReactorHttpServer,
} from "./utils/reactor-http-server.js";
import { createTestSigner, signFor } from "./utils/test-signer.js";

type ServedDocument = {
  id: string;
  state: Record<string, unknown>;
};
type GraphQLResponse = {
  data?: Record<string, ServedDocument> | null;
  errors?: {
    message: string;
    extensions?: {
      code?: string;
      receipt?: { documentId: string; branch: string };
    };
  }[];
};

const createMutation = `
  mutation Create($document: JSONObject!, $parentIdOrSlug: String) {
    createDocument(document: $document, parentIdOrSlug: $parentIdOrSlug) { id state }
  }
`;
const createEmptyMutation = `
  mutation CreateEmpty($documentType: String!) {
    createEmptyDocument(documentType: $documentType) { id state }
  }
`;

describe("initial authorization through the HTTP GraphQL creation routes", () => {
  let host: InProcessReactorClientModule;
  let server: ReactorHttpServer;
  let ownerSigner: Awaited<ReturnType<typeof createTestSigner>>;
  const requesters: string[] = [];
  const owner = "0xowner";
  const outsider = "0xoutsider";
  const service = "0xservice";
  const provisioner = "0xprovisioner";

  beforeAll(async () => {
    const signer = await createTestSigner(service);
    ownerSigner = await createTestSigner(owner);
    const initializerKey = actionSignerIdentity(signer).app.key;
    const identities = new Map([
      [initializerKey, service],
      [actionSignerIdentity(ownerSigner).app.key, owner],
    ]);
    const noteProvider = defineInitialAuthProvider(referenceNote, {
      deployment: { administrator: authAddress("0xadministrator") },
      authorizeCreation({ requester }) {
        requesters.push(requester.address ?? "anonymous");
        if (requester.address !== owner)
          throw new Error("Only the verified owner may create a note");
      },
      resolveInstance({ requester }) {
        return { owner: authAddress(requester.address) };
      },
    });
    const profileProvider = defineInitialAuthProvider(referenceProfile, {
      deployment: {
        administrator: authAddress("0xadministrator"),
        service: authAddress(service),
      },
      authorizeCreation({ requester, initialState }) {
        if (
          ![service, provisioner].includes(requester.address ?? "") ||
          initialState.global.ownerAddress !== null
        )
          throw new Error("Only the service may create an unclaimed profile");
      },
      resolveInstance: () => ({}),
    });
    host = await new ReactorClientBuilder()
      .withSigner(signer)
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule,
            documentModelDocumentModelModule,
            referenceNote,
            referenceProfile,
          ])
          .withTrustPolicy({
            authorizeSigner: (identity, key) =>
              Promise.resolve(identities.get(key) === identity.user.address),
          })
          .withExecutorConfig({
            signatureVerification: "enforce",
            featureFlags: {
              documentDecisions: true,
              authEnforcement: true,
              authGroups: true,
              authConditions: true,
              undoV3: true,
            },
          })
          .withInitialAuth({
            providers: [noteProvider, profileProvider],
            trustOrigin: (origin) => origin.initializerKey === initializerKey,
          }),
      )
      .buildModule();
    server = await startReactorHttpServer(host, openAuthorization);
  }, 60_000);

  afterAll(async () => {
    await server?.close();
    await host?.reactor.kill().completed;
  });

  async function post(
    query: string,
    variables: Record<string, unknown>,
    bearer?: string,
  ): Promise<GraphQLResponse> {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as GraphQLResponse;
  }

  async function stored(response: GraphQLResponse, field: string) {
    expect(response.errors).toBeUndefined();
    const document = response.data?.[field];
    expect(document?.id).toBeTruthy();
    if (!document) throw new Error("Creation did not return its document");
    return {
      returned: document,
      persisted: await host.reactor.getByIdOrSlug<PHDocument>(document.id),
    };
  }

  it("binds the authenticated requester while the host signs, and gates returned scopes", async () => {
    const draft = referenceNote.utils.createDocument();
    draft.state.global.title = "HTTP owner note";
    const response = await post(createMutation, { document: draft }, owner);
    const { returned, persisted } = await stored(response, "createDocument");
    expect(requesters.at(-1)).toBe(owner);
    expect(returned.state.global).toMatchObject({ title: "HTTP owner note" });
    expect(returned.state).not.toHaveProperty("local");
    expect(JSON.stringify(response)).not.toContain("PRIVATE_INITIAL_DRAFT");
    expect(persisted.state.auth.creator).toBeUndefined();
    expect(
      persisted.state.auth.grants.find((grant) => grant.id === "owner-title")
        ?.principal,
    ).toEqual({ address: owner });
    expect(
      (await host.read.get(returned.id, { subject: { address: service } }))
        .state,
    ).not.toHaveProperty("global");

    const signed = await signFor(
      ownerSigner,
      referenceNote.actions.setTitle({ title: "Edited over HTTP" }),
      returned.id,
    );
    if (!signed.context?.signer) throw new Error("Missing owner signature");
    const edited = await post(
      `mutation Edit($id: String!, $actions: [ActionInput!]!) {
        execute(documentIdOrSlug: $id, actions: $actions) { id state }
      }`,
      {
        id: returned.id,
        actions: [
          {
            ...signed,
            context: {
              signer: {
                ...signed.context.signer,
                signatures: signed.context.signer.signatures.map((tuple) =>
                  tuple.join(", "),
                ),
              },
            },
          },
        ],
      },
      owner,
    );
    expect(edited.errors).toBeUndefined();
    expect(edited.data?.execute.state.global).toMatchObject({
      title: "Edited over HTTP",
    });
    expect(edited.data?.execute.state).not.toHaveProperty("local");
  });

  it("applies the same initial policy when the HTTP route creates an empty document", async () => {
    const response = await post(
      createEmptyMutation,
      { documentType: referenceNote.documentModel.global.id },
      owner,
    );
    const { returned, persisted } = await stored(
      response,
      "createEmptyDocument",
    );
    expect(requesters.at(-1)).toBe(owner);
    expect(returned.state.global).toMatchObject({ title: "Draft" });
    expect(persisted.state.auth.version).toBe(1);
    expect(persisted.state.auth.creator).toBeUndefined();
  });

  it("refuses an outsider or anonymous caller even when the host's legacy create permission is open", async () => {
    for (const bearer of [outsider, undefined]) {
      const response = await post(
        createMutation,
        { document: referenceNote.utils.createDocument() },
        bearer,
      );
      expect(response.data).toBeNull();
      expect(response.errors?.[0].message).toContain("verified owner");
      expect(requesters.at(-1)).toBe(bearer ?? "anonymous");
    }
  });

  it("refuses caller-supplied policy or an already-claimed invitation", async () => {
    const injected = referenceNote.utils.createDocument();
    injected.state.auth = {
      version: 1,
      grants: [
        {
          id: "injected-admin",
          description: "Caller role claim",
          effect: "allow",
          principal: { address: owner },
          capability: { can: "execute", scope: "*" },
        },
      ],
    };
    const policyResponse = await post(
      createMutation,
      { document: injected },
      owner,
    );
    expect(policyResponse.data).toBeNull();
    expect(policyResponse.errors?.length).toBeGreaterThan(0);

    const invitation = referenceProfile.utils.createDocument();
    invitation.state.global.ownerAddress = outsider;
    const stateResponse = await post(
      createMutation,
      { document: invitation },
      service,
    );
    expect(stateResponse.data).toBeNull();
    expect(stateResponse.errors?.[0].message).toContain("unclaimed profile");
  });

  it("can create a profile without granting its creator permission to read it", async () => {
    const response = await post(
      createMutation,
      { document: referenceProfile.utils.createDocument() },
      provisioner,
    );
    const { returned, persisted } = await stored(response, "createDocument");
    expect(returned.state).not.toHaveProperty("global");
    expect(persisted.state.auth.version).toBe(1);
    expect(persisted.state.auth.creator).toBeUndefined();
  });

  it("refuses protected creation when the transport cannot pass a verified requester", async () => {
    const remoteLikeWrite = new Proxy(host.write, {
      get(target, property, receiver) {
        if (property === "createWithInitialAuth") return undefined;
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const remoteLikeServer = await startReactorHttpServer(
      { read: host.read, write: remoteLikeWrite },
      openAuthorization,
    );
    try {
      const response = await fetch(remoteLikeServer.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${outsider}`,
        },
        body: JSON.stringify({
          query: createMutation,
          variables: { document: referenceProfile.utils.createDocument() },
        }),
      });
      const body = (await response.json()) as GraphQLResponse;
      expect(body.data).toBeNull();
      expect(body.errors?.[0].message).toContain("protected document creation");
    } finally {
      await remoteLikeServer.close();
    }
  });

  it("returns a recoverable receipt when parent attachment fails after protected creation", async () => {
    const parent = await host.write.createEmpty(
      documentModelDocumentModelModule.documentModel.global.id,
    );
    const parentId = (await parent.readable).documentId;
    const failingAttachment = new Proxy(host.write, {
      get(target, property, receiver) {
        if (property === "addRelationship")
          return () => Promise.reject(new Error("Parent permission changed"));
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const attachmentServer = await startReactorHttpServer(
      { read: host.read, write: failingAttachment },
      openAuthorization,
    );
    try {
      const response = await fetch(attachmentServer.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${owner}`,
        },
        body: JSON.stringify({
          query: createMutation,
          variables: {
            document: referenceNote.utils.createDocument(),
            parentIdOrSlug: parentId,
          },
        }),
      });
      const body = (await response.json()) as GraphQLResponse;
      expect(body.data).toBeNull();
      expect(body.errors?.[0].extensions?.code).toBe(
        "INITIAL_AUTH_ATTACHMENT_FAILED",
      );
      const receipt = body.errors?.[0].extensions?.receipt;
      expect(receipt?.documentId).toBeTruthy();
      if (!receipt)
        throw new Error("Attachment failure lost the creation receipt");
      const document = await host.reactor.getByIdOrSlug(receipt.documentId);
      expect(document.state.auth.version).toBe(1);
      expect(document.state.auth.creator).toBeUndefined();
      expect(
        (
          await host.read.get(receipt.documentId, {
            subject: { address: outsider },
          })
        ).state,
      ).not.toHaveProperty("global");
    } finally {
      await attachmentServer.close();
    }
  });
});
