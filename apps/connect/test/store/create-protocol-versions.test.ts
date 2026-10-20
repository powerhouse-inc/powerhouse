import {
  addDocument,
  addFullReactorClientEventHandler,
} from "@powerhousedao/reactor-browser";
import {
  deriveDocumentId,
  type DocumentModelModule,
  type ISigner,
  type PeerCapabilityFlags,
  type Reducer,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, logger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectAppReactorClient } from "../../src/store/app-reactor-client.js";
import {
  data,
  DRIVE_TYPE,
  serve,
  switchboard,
  type Received,
  type StubSwitchboard,
} from "./switchboard-stub.js";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = Object.assign(
    new EventTarget(),
    { ph: {} },
  );
});

vi.mock("../../src/pglite.db.js", () => ({
  getReactorPGlite: vi.fn(),
  discardReactorPGlite: () => Promise.resolve(),
}));

addFullReactorClientEventHandler();

const MODEL_TYPE = "powerhouse/document-model";

const signer = {
  user: undefined,
  app: { name: "test", key: "app-key" },
  signAction: () => Promise.resolve(["1", "0xsig", "", "", ""]),
} as unknown as ISigner;

const tagged =
  documentModelDocumentModelModule as unknown as DocumentModelModule;
const untagged: DocumentModelModule = {
  ...tagged,
  reducer: ((...args) => (tagged.reducer as Reducer)(...args)) as Reducer,
};

let stub: StubSwitchboard | undefined;

afterEach(async () => {
  window.ph = {};
  await stub?.close();
  stub = undefined;
});

/** A Switchboard whose createDefaults answers base-reducer 2 for anything. */
async function remoteConnect(
  models: DocumentModelModule[],
  featureFlags?: PeerCapabilityFlags,
) {
  const documents: Record<string, string> = { "drive-1": DRIVE_TYPE };
  stub = await serve(
    switchboard(documents, ({ body }) => {
      for (const input of createInputs([{ body } as Received])) {
        documents[input.documentId] = input.model;
      }
      return body.operationName === "GetCreateDefaults" ||
        body.operationName === "GetCreateProtocolVersions"
        ? data({
            createDefaults: {
              signaturePolicy: "v2-required",
              protocolVersions: { "base-reducer": 2 },
            },
          })
        : undefined;
    }),
  );
  await selectAppReactorClient({
    mode: "remote",
    module: undefined,
    remoteDriveUrl: stub.url.replace(/\/graphql$/, "/d/drive-1"),
    signer,
    documentModelModules: models,
    featureFlags,
  });
  return stub;
}

type CreateInput = {
  model: string;
  documentId: string;
  signing: { nonce: string; createdAtUtcIso: string };
  protocolVersions: Record<string, number>;
};

function createInputs(received: readonly Received[]): CreateInput[] {
  return received
    .filter((entry) => entry.body.operationName === "ExecuteBatch")
    .flatMap(
      (entry) =>
        (
          entry.body.variables as {
            jobs: { actions: { type: string; input: unknown }[] }[];
          }
        ).jobs,
    )
    .flatMap((job) => job.actions)
    .filter((action) => action.type === "CREATE_DOCUMENT")
    .map((action) => action.input as CreateInput);
}

/** The one create sent; its id must be derived from the versions it carries. */
function createdVersions(received: readonly Received[]) {
  const creates = createInputs(received);
  expect(creates).toHaveLength(1);
  const [input] = creates;
  expect(
    deriveDocumentId({
      documentType: input.model,
      createdAtUtcIso: input.signing.createdAtUtcIso,
      nonce: input.signing.nonce,
      protocolVersions: input.protocolVersions,
    }),
  ).toBe(input.documentId);
  return input.protocolVersions;
}

function operationNames(received: readonly Received[]) {
  return received.map((entry) => entry.body.operationName);
}

describe("remote Connect picks a new document's protocol versions", () => {
  it("creates a model whose reducer createReducer built at base-reducer 3", async () => {
    const { received } = await remoteConnect([tagged]);

    const node = await addDocument("drive-1", "Doc", MODEL_TYPE);

    expect(createdVersions(received)).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
    expect(createInputs(received)[0].documentId).toBe(node.id);
    expect(operationNames(received)).not.toContain("GetCreateProtocolVersions");
    expect(
      operationNames(received).filter((name) => name === "GetCreateDefaults"),
    ).toHaveLength(1);
  });

  it("creates a model whose reducer createReducer did not build at base-reducer 2", async () => {
    const { received } = await remoteConnect([untagged]);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    try {
      await addDocument("drive-1", "Doc", MODEL_TYPE);
    } finally {
      warn.mockRestore();
    }

    expect(createdVersions(received)).toEqual({
      "base-reducer": 2,
      signature: 2,
    });
    expect(operationNames(received)).not.toContain("GetCreateProtocolVersions");
  });

  it("creates at base-reducer 2 with Connect's undoV3 off", async () => {
    const { received } = await remoteConnect([tagged], { undoV3: false });

    await addDocument("drive-1", "Doc", MODEL_TYPE);

    expect(createdVersions(received)).toEqual({
      "base-reducer": 2,
      signature: 2,
    });
  });
});
