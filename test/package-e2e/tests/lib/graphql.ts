import { GraphQLReactorClient } from "@powerhousedao/reactor-browser/graphql-client";
import { setDriveName } from "@powerhousedao/shared/document-drive";
import {
  baseCreateDocument,
  createBaseState,
  createReducer,
  generateActionId,
  type Action,
  type DocumentModelModule,
  type PHBaseState,
} from "@powerhousedao/shared/document-model";
import { testSigner } from "@powerhousedao/shared/testing";
import { readFileSync } from "node:fs";

const SWITCHBOARD_URL = process.env.SWITCHBOARD_URL ?? "http://localhost:4001";

export async function graphql<T>(
  path: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SWITCHBOARD_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new Error(
      `GraphQL error at ${path}:\n${body.errors.map((e) => e.message).join("\n")}`,
    );
  }
  if (!body.data) {
    throw new Error(`GraphQL response missing data at ${path}`);
  }
  return body.data;
}

/** The address the spec's own writes are signed for. */
export const E2E_WRITER_ADDRESS = "0x00000000000000000000000000000000000000e3";

export const TODO_DOCUMENT_TYPE = "test/todo";

type TodoFixture = {
  state: {
    global: {
      id: string;
      specifications: {
        version: number;
        state: {
          global: { initialValue: string };
          local: { initialValue: string };
        };
      }[];
    };
  };
};

type TodoState = PHBaseState & {
  global: Record<string, unknown>;
  local: Record<string, unknown>;
};

/**
 * The published test/todo model as far as heading a new document needs: its
 * type, version and initial state, read off the fixture spec it is generated
 * from, the way codegen writes `utils.createDocument`, and a reducer built by
 * `createReducer`, as codegen builds the real one, so the client keeps the
 * base-reducer the Switchboard picks for the type. The harness never loads
 * the package and reduces nothing: it writes one action at a time, and the
 * Switchboard reduces every action with the real model.
 */
function todoModelForCreate(): DocumentModelModule {
  const fixture = JSON.parse(
    readFileSync(new URL("../../fixtures/todo.json", import.meta.url), "utf8"),
  ) as TodoFixture;
  const model = fixture.state.global;
  const spec = model.specifications.at(-1)!;
  const parse = (value: string): Record<string, unknown> =>
    value ? (JSON.parse(value) as Record<string, unknown>) : {};
  const initialGlobal = parse(spec.state.global.initialValue);
  const initialLocal = parse(spec.state.local.initialValue);
  const createState = (state?: Partial<TodoState>): TodoState => ({
    ...createBaseState(state?.auth, {
      version: spec.version,
      ...state?.document,
    }),
    global: { ...initialGlobal, ...state?.global },
    local: { ...initialLocal, ...state?.local },
  });
  return {
    version: spec.version,
    documentModel: { global: { id: model.id } },
    reducer: createReducer(() => undefined),
    utils: {
      createDocument: (state?: Partial<TodoState>) =>
        baseCreateDocument(createState, state, model.id),
    },
  } as unknown as DocumentModelModule;
}

/**
 * Writes to the Switchboard as the spec's own signer, as a Powerhouse client
 * does: a Switchboard signs no write for its callers.
 */
export async function signedWriter(): Promise<GraphQLReactorClient> {
  return new GraphQLReactorClient({
    url: `${SWITCHBOARD_URL}/graphql`,
    signer: await testSigner(E2E_WRITER_ADDRESS, { app: "package-e2e" }),
    documentModels: [todoModelForCreate()],
    realtime: false,
  });
}

export async function createRemoteDrive(
  writer: GraphQLReactorClient,
  name: string,
): Promise<{
  id: string;
  slug: string;
  url: string;
}> {
  const drive = await writer.create(
    await writer.newDocument("powerhouse/document-drive", { name }),
  );
  const { id, slug } = drive.header;
  await writer.execute(id, "main", [setDriveName({ name })]);
  return { id, slug, url: `${SWITCHBOARD_URL}/d/${id}` };
}

/** A todo document named `name`, created and filed in `driveId`, signed. */
export async function createTodo(
  writer: GraphQLReactorClient,
  name: string,
  driveId: string,
): Promise<{ id: string; name: string }> {
  const created = await writer.create(
    await writer.newDocument(TODO_DOCUMENT_TYPE, { name }),
    driveId,
  );
  return { id: created.header.id, name: created.header.name };
}

/** One action of the todo model's, for `execute`: the operation's type and input. */
export function todoAction(type: string, input: unknown): Action {
  return {
    id: generateActionId(),
    type,
    timestampUtcMs: new Date().toISOString(),
    input,
    scope: "global",
  };
}

export interface DocumentOperationRecord {
  index: number;
  hash: string;
  timestampUtcMs: string;
  action: {
    type: string;
    input: Record<string, unknown>;
    scope: string;
  };
}

export async function getDocumentOperations(
  documentId: string,
): Promise<DocumentOperationRecord[]> {
  const data = await graphql<{
    documentOperations: {
      items: DocumentOperationRecord[];
    };
  }>(
    "/graphql",
    `
      query Ops($id: String!) {
        documentOperations(
          filter: { documentIdOrSlug: $id, scopes: ["global"] }
        ) {
          items {
            index
            hash
            timestampUtcMs
            action {
              type
              input
              scope
            }
          }
        }
      }
    `,
    { id: documentId },
  );
  return data.documentOperations.items;
}
