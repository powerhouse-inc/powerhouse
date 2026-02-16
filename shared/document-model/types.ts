import type { ProcessorFactoryBuilder } from "../processors/types.js";
import type { Action } from "./core/actions.js";
import type { PHDocument } from "./core/documents.js";
import type { PHBaseState } from "./core/state.js";
import type {
  AssertIsDocumentOfType,
  AssertIsStateOfType,
  CreateDocument,
  CreateState,
  EditorModule,
  ID,
  ImportScriptModule,
  IsDocumentOfType,
  IsStateOfType,
  LoadFromInput,
  Manifest,
  ProcessorModule,
  Reducer,
  SaveToFileHandle,
  SubgraphModule,
} from "./core/types.js";
import type { UpgradeManifest } from "./core/upgrades.js";

export type State = {
  examples: CodeExample[];
  initialValue: string;
  schema: string;
};

export type ScopeState = {
  global: State;
  local: State;
};

export type DocumentModelUtils<TState extends PHBaseState = PHBaseState> = {
  fileExtension: string;
  createState: CreateState<TState>;
  createDocument: CreateDocument<TState>;
  loadFromInput: LoadFromInput<TState>;
  saveToFileHandle: SaveToFileHandle;
  isStateOfType: IsStateOfType<TState>;
  assertIsStateOfType: AssertIsStateOfType<TState>;
  isDocumentOfType: IsDocumentOfType<TState>;
  assertIsDocumentOfType: AssertIsDocumentOfType<TState>;
};

export type DocumentModelModule<TState extends PHBaseState = PHBaseState> = {
  /** optional version field, should be made required */
  version?: number;
  reducer: Reducer<TState>;
  actions: Record<string, (...args: any[]) => Action>;
  utils: DocumentModelUtils<TState>;
  documentModel: DocumentModelPHState;
};

export type DocumentModelLib<TState extends PHBaseState = PHBaseState> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<TState>[];
  editors: EditorModule[];
  subgraphs: SubgraphModule[];
  importScripts: ImportScriptModule[];
  processorFactory: ProcessorFactoryBuilder;
  upgradeManifests: UpgradeManifest<readonly number[]>[];
};

export type Author = {
  name: string;
  website: string | null;
};

export type OperationErrorSpecification = {
  code: string | null;
  description: string | null;
  id: ID;
  name: string | null;
  template: string | null;
};

export type CodeExample = {
  id: ID;
  value: string;
};

export type OperationSpecification = {
  description: string | null;
  errors: OperationErrorSpecification[];
  examples: CodeExample[];
  id: ID;
  name: string | null;
  reducer: string | null;
  schema: string | null;
  template: string | null;
  scope: string;
};

export type ModuleSpecification = {
  description: string | null;
  id: ID;
  name: string;
  operations: OperationSpecification[];
};

export type DocumentSpecification = {
  changeLog: string[];
  modules: ModuleSpecification[];
  state: ScopeState;
  version: number;
};

export type DocumentModelGlobalState = {
  author: Author;
  description: string;
  extension: string;
  id: string;
  name: string;
  specifications: DocumentSpecification[];
};

export type DocumentModelLocalState = {};
export type DocumentModelPHState = PHBaseState & {
  global: DocumentModelGlobalState;
  local: DocumentModelLocalState;
};

export type DocumentModelDocument = PHDocument<DocumentModelPHState>;
export type DocumentModelDocumentModelModule =
  DocumentModelModule<DocumentModelPHState>;
