import type {
  Action,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
} from "document-model";
import {
  createPresignedHeader,
  createReducer,
  defaultBaseState,
  generateId,
} from "document-model";

/**
 * Static fixture document model so the e2e project always ships at least one
 * creatable document type. The generic drive explorer deliberately hides its
 * "Create New Document" button when zero types are creatable, and in a clean
 * CI checkout the project has no generated document models until
 * todo-document.spec.ts runs — specs that need the button (e.g.
 * generic-drive-hidden-vetra-documents.spec.ts) rely on this module instead
 * of cross-spec codegen side effects.
 *
 * It lives outside document-models/ because that directory is codegen-managed
 * and wiped by global-teardown.ts.
 */
const FIXTURE_DOCUMENT_TYPE = "e2e/sample-note";

type SampleNoteGlobalState = { text: string };

function createFixtureState(): PHBaseState {
  return {
    ...defaultBaseState(),
    global: { text: "" } satisfies SampleNoteGlobalState,
    local: {},
  } as PHBaseState;
}

function createFixtureDocument(): PHDocument {
  const state = createFixtureState();
  return {
    header: createPresignedHeader(generateId(), FIXTURE_DOCUMENT_TYPE),
    state,
    initialState: createFixtureState(),
    operations: { global: [], local: [] },
    clipboard: [],
  };
}

const fixtureReducer = createReducer(
  (state: PHBaseState, _action: Action) => state,
);

export const SampleNote = {
  version: 1,
  reducer: fixtureReducer,
  actions: {},
  utils: {
    createDocument: createFixtureDocument,
    createState: createFixtureState,
  },
  documentModel: {
    global: {
      id: FIXTURE_DOCUMENT_TYPE,
      name: "Sample Note",
      description: "Static e2e fixture document type",
      extension: ".e2en",
      author: { name: "Powerhouse", website: "" },
      specifications: [{ version: 1, changeLog: [] }],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

export const e2eFixtureDocumentModels: DocumentModelModule[] = [SampleNote];
