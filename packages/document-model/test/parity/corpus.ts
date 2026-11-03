import type {
  DocumentModelDefinition,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import { appModule } from "./corpus/app-module.js";
import { documentDrive } from "./corpus/document-drive.js";
import { extensions } from "./corpus/extensions.js";
import { processorModule } from "./corpus/processor-module.js";
import { reactorGroup } from "./corpus/reactor-group.js";
import { sample } from "./corpus/sample.js";
import { versionedTodo } from "./corpus/versioned-todo.js";
import { vetraPackage } from "./corpus/vetra-package.js";

export type Twin = {
  readonly definition: DocumentModelDefinition;
  readonly documentModel: DocumentModelPHState;
  readonly actions: object;
};

export type ParityVersion = {
  readonly version: number;
  readonly twin: Twin;
  readonly zod: string | null;
};

export type ParityPair = {
  readonly name: string;
  readonly original: string;
  readonly versions: readonly ParityVersion[];
};

const VETRA = "packages/vetra/document-models";
const VERSIONED_TODO = "test/versioned-documents/document-models/todo";
const FIXTURES = "packages/document-model/test/parity/fixtures";

function single(
  name: string,
  original: string,
  twin: Twin,
  zod: string | null,
): ParityPair {
  return { name, original, versions: [{ version: 1, twin, zod }] };
}

function vetra(name: string, twin: Twin): ParityPair {
  return single(
    name,
    `${VETRA}/${name}/${name}.json`,
    twin,
    `${VETRA}/${name}/v1/gen/schema/zod.ts`,
  );
}

export const PARITY_PAIRS: readonly ParityPair[] = [
  single(
    "document-drive",
    "packages/shared/document-drive/document-drive.json",
    documentDrive,
    "packages/shared/document-drive/gen/schema/zod.ts",
  ),
  single(
    "reactor-group",
    "packages/reactor-group/document-models/reactor-group/reactor-group.json",
    reactorGroup,
    "packages/reactor-group/document-models/reactor-group/v1/gen/schema/zod.ts",
  ),
  vetra("app-module", appModule),
  vetra("processor-module", processorModule),
  vetra("vetra-package", vetraPackage),
  {
    name: "versioned-todo",
    original: `${VERSIONED_TODO}/todo.json`,
    versions: [1, 2].map((version) => ({
      version,
      twin: versionedTodo.at(version as 1 | 2),
      zod: `${VERSIONED_TODO}/v${version}/gen/schema/zod.ts`,
    })),
  },
  single("extensions", `${FIXTURES}/extensions.json`, extensions, null),
  single("sample", `${FIXTURES}/sample.json`, sample, null),
];
