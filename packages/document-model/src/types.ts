import type {
  Action,
  AssertIsDocumentOfType,
  AssertIsStateOfType,
  CreateDocument,
  CreateState,
  DocumentModelPHState,
  EditorModule,
  ImportScriptModule,
  IsDocumentOfType,
  IsStateOfType,
  LoadFromInput,
  Manifest,
  PHBaseState,
  Reducer,
  SaveToFileHandle,
  SubgraphModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { ProcessorFactoryBuilder } from "@powerhousedao/shared/processors";

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

export type Actions = Record<string, (...args: any[]) => Action>;

export type DocumentModelModule<TState extends PHBaseState = PHBaseState> = {
  /** optional version field, should be made required */
  version?: number;
  reducer: Reducer<TState>;
  actions: Actions;
  utils: DocumentModelUtils<TState>;
  documentModel: DocumentModelPHState;
};

export type DocumentModelLib<TState extends PHBaseState = PHBaseState> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<TState>[];
  editors: EditorModule[];
  subgraphs: SubgraphModule[];
  importScripts: ImportScriptModule[];
  upgradeManifests: UpgradeManifest<readonly number[]>[] | undefined;
  processorFactory: ProcessorFactoryBuilder;
};

export type DocumentModelDocumentModelModule =
  DocumentModelModule<DocumentModelPHState>;
