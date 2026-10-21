import {
  addDocument,
  addDrive,
  addFullReactorClientEventHandler,
  addReactorClientEventHandler,
  setReactorClient,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  deriveDocumentId,
  hasDerivedDocumentId,
  type PHDocumentHeader,
  type DocumentModelModule,
  type ISigner,
  type Reducer,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule, logger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectAppReactorClient } from "../src/runtime/app-reactor-client.js";
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

addFullReactorClientEventHandler();
addReactorClientEventHandler();

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

const drive = driveDocumentModelModule as unknown as DocumentModelModule;

/** A Switchboard whose createDefaults selects `hostVersions`, per type when a function. */
async function remoteConnect(
  models: DocumentModelModule[],
  hostVersions:
    | Record<string, number>
    | ((documentType: string | undefined) => Record<string, number>)
    | "no-create-defaults",
) {
  const documents: Record<string, string> = { "drive-1": DRIVE_TYPE };
  stub = await serve(
    switchboard(documents, ({ body }) => {
      for (const input of createInputs([{ body } as Received])) {
        documents[input.documentId] = input.model;
      }
      const asksDefaults =
        body.operationName === "GetCreateDefaults" ||
        body.operationName === "GetCreateProtocolVersions";
      if (asksDefaults && hostVersions === "no-create-defaults") {
        return {
          status: 400,
          body: JSON.stringify({
            errors: [
              {
                message: 'Cannot query field "createDefaults" on type "Query".',
                extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
              },
            ],
          }),
        };
      }
      const documentType = (body.variables as { documentType?: string })
        ?.documentType;
      return asksDefaults
        ? data({
            createDefaults: {
              signaturePolicy: "v2-required",
              protocolVersions:
                typeof hostVersions === "function"
                  ? hostVersions(documentType)
                  : hostVersions,
            },
          })
        : undefined;
    }),
  );
  const client = await selectAppReactorClient({
    mode: "remote",
    module: undefined,
    remoteDriveUrl: stub.url.replace(/\/graphql$/, "/d/drive-1"),
    signer,
    documentModelModules: [...models, drive],
  });
  setReactorClient(client);
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

/** The one drive sent; its id must be derived from the versions it carries. */
function createdDriveVersions(received: readonly Received[]) {
  const headers = received
    .filter((entry) => entry.body.operationName === "CreateDocument")
    .map(
      (entry) =>
        (entry.body.variables as { document: { header: PHDocumentHeader } })
          .document.header,
    );
  expect(headers).toHaveLength(1);
  const [header] = headers;
  expect(header.documentType).toBe(DRIVE_TYPE);
  expect(hasDerivedDocumentId(header)).toBe(true);
  return header.protocolVersions;
}

function operationNames(received: readonly Received[]) {
  return received.map((entry) => entry.body.operationName);
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  try {
    return await run();
  } finally {
    warn.mockRestore();
  }
}

describe("remote Connect against a Switchboard that runs base-reducer 3", () => {
  const v3 = { "base-reducer": 3 };

  it("creates a model whose reducer createReducer built at base-reducer 3", async () => {
    const { received } = await remoteConnect([tagged], v3);

    const node = await addDocument("drive-1", "Doc", MODEL_TYPE);

    expect(createdVersions(received)).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
    expect(createInputs(received)[0].documentId).toBe(node.id);
    expect(operationNames(received)).toContain("GetCreateProtocolVersions");
  });

  it("creates a model whose reducer createReducer did not build at base-reducer 2", async () => {
    const { received } = await remoteConnect([untagged], v3);

    await quietly(() => addDocument("drive-1", "Doc", MODEL_TYPE));

    expect(createdVersions(received)).toEqual({
      "base-reducer": 2,
      signature: 2,
    });
  });

  it("creates a drive at base-reducer 3", async () => {
    const { received } = await remoteConnect([tagged], v3);

    await addDrive({ global: { name: "Drive" } });

    expect(createdDriveVersions(received)).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
  });

  it("creates at what the Switchboard selects for the type", async () => {
    const { received } = await remoteConnect([tagged], (documentType) =>
      documentType === MODEL_TYPE ? { "base-reducer": 2 } : v3,
    );

    await addDocument("drive-1", "Doc", MODEL_TYPE);

    expect(createdVersions(received)).toEqual({
      "base-reducer": 2,
      signature: 2,
    });
  });
});

describe.each([
  ["selects base-reducer 2", { "base-reducer": 2 }],
  ["selects no base-reducer", {}],
])(
  "remote Connect against a Switchboard that %s",
  (_name, hostVersions: Record<string, number>) => {
    it("creates a model whose reducer createReducer built at base-reducer 2", async () => {
      const { received } = await remoteConnect([tagged], hostVersions);

      await addDocument("drive-1", "Doc", MODEL_TYPE);

      expect(createdVersions(received)).toEqual({
        "base-reducer": 2,
        signature: 2,
      });
    });

    it("creates a drive at base-reducer 2", async () => {
      const { received } = await remoteConnect([tagged], hostVersions);

      await addDrive({ global: { name: "Drive" } });

      expect(createdDriveVersions(received)).toEqual({
        "base-reducer": 2,
        signature: 2,
      });
    });
  },
);

describe("remote Connect against a Switchboard without createDefaults", () => {
  it("refuses to create, as it cannot read the signature policy", async () => {
    const { received } = await remoteConnect([tagged], "no-create-defaults");

    await expect(
      addDocument("drive-1", "Doc", MODEL_TYPE),
    ).rejects.toMatchObject({ name: "GraphQLOperationNotSupportedError" });
    await expect(addDrive({ global: { name: "Drive" } })).rejects.toMatchObject(
      { name: "GraphQLOperationNotSupportedError" },
    );
    expect(createInputs(received)).toEqual([]);
    expect(operationNames(received)).not.toContain("CreateDocument");
  });
});
