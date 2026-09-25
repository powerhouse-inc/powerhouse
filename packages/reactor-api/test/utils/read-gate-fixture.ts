import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  initializeAuth,
  withSignaturePolicy,
  type DocumentModelModule,
  type Grant,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { Context } from "../../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../../src/services/authorization.service.js";
import { createTestSigner } from "./test-signer.js";

export const READER = "0xreader";
export const OUTSIDER = "0xoutsider";
export const HOST = "0xhost";

export type ReadGateClient = InProcessReactorClientModule["client"];

// The host's legacy layer under OPEN admits everyone, anonymous included.
export const openAuthorization: IAuthorizationService = {
  config: {
    admins: [],
    defaultProtection: false,
    policy: AuthorizationPolicy.OPEN,
  },
  isSupremeAdmin: () => true,
  canCreate: () => true,
  canRead: () => Promise.resolve(true),
  canWrite: () => Promise.resolve(true),
  canManage: () => Promise.resolve(true),
  canMutate: () => Promise.resolve(true),
};

export function contextFor(address?: string): Context {
  return {
    user: address ? { address } : undefined,
    headers: {},
    db: null,
  } as unknown as Context;
}

// Signs as HOST, so a grant can admit the host's writes without letting everyone read.
export async function buildReadGateReactor(
  modules: DocumentModelModule[] = [],
): Promise<InProcessReactorClientModule> {
  return new ReactorClientBuilder()
    .withSigner(await createTestSigner(HOST))
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
          ...modules,
        ])
        .withExecutorConfig({
          featureFlags: { documentDecisions: true, authEnforcement: true },
        }),
    )
    .buildModule();
}

/** A legacy document with a fixed id; a fixed id cannot be content-addressed. */
export async function createFixture(
  client: ReadGateClient,
  id: string,
  options: {
    source?: { utils: { createDocument: () => PHDocument } };
    parent?: string;
  } = {},
): Promise<string> {
  const source = options.source ?? documentModelDocumentModelModule;
  const document = withSignaturePolicy(
    source.utils.createDocument(),
    "legacy",
    { id },
  );
  document.header.name = id;
  await client.create(document, options.parent);
  return id;
}

/** Only READER reads the domain; the host keeps writing every scope. */
export async function police(
  client: ReadGateClient,
  id: string,
): Promise<void> {
  const grants: Grant[] = [
    {
      id: "g-read",
      description: "the reader reads the domain",
      effect: "allow",
      principal: { address: READER },
      capability: { can: "read", scope: "global" },
    },
    ...["global", "local", "document", "header", "auth"].map(
      (scope): Grant => ({
        id: `g-host-${scope}`,
        description: "the host writes",
        effect: "allow",
        principal: { address: HOST },
        capability: { can: "execute", scope },
      }),
    ),
  ];
  await client.execute(id, "main", [initializeAuth({ version: 1, grants })]);
}

/** Whether a served document carries its domain state. */
export function holdsGlobal(document: { state?: unknown }): boolean {
  return (
    typeof document.state === "object" &&
    document.state !== null &&
    "global" in document.state
  );
}
