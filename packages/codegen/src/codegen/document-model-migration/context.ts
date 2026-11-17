/** The result types of a document-model migration, its refusals, and what each version's conversion reads. */
import type { Project } from "ts-morph";
import { Node, type SourceFile } from "ts-morph";
import { directEvalCall, importMetaRead } from "../migration-ast.js";
import {
  type DeclaredType,
  type StoredModel,
  type StoredModule,
  type StoredSpecification,
} from "./stored-model.js";

/** @experimental Why a document model was not converted, and how to fix it. */
export type DocumentModelMigrationRefusal = {
  /** Project-relative path. */
  readonly file: string;
  /** Absent for a problem in the stored specification, which has no useful line. */
  readonly line?: number;
  readonly reason: string;
  readonly repair: string;
};

/**
 * @experimental A file the conversion changes. `before` is null for a new
 * file and `after` is null for a deleted one.
 */
export type DocumentModelMigrationFile = {
  /** Project-relative path. */
  readonly path: string;
  readonly before: string | null;
  readonly after: string | null;
};

/** @experimental A host-resolved static module reference, using project-relative paths. */
export type DocumentModelMigrationReference = {
  readonly file: string;
  readonly specifier: string;
  /** Existing targets under every static condition, including files outside the source inventory. */
  readonly targets: readonly string[];
};

/** @experimental The outcome of converting one schema-first document model. */
export type DocumentModelMigration =
  | {
      readonly kind: "refused";
      readonly dirName: string;
      readonly refusals: readonly DocumentModelMigrationRefusal[];
    }
  | {
      readonly kind: "converted";
      readonly dirName: string;
      readonly documentType: string;
      readonly versions: readonly number[];
      readonly files: readonly DocumentModelMigrationFile[];
      /** Differences a reader of the stored specification can see. */
      readonly notes: readonly string[];
      /** Types renamed off a scalar's name, by version. */
      readonly renamedTypes: readonly {
        readonly version: number;
        readonly from: string;
        readonly to: string;
      }[];
    };

export class Refused extends Error {
  constructor(readonly refusals: readonly DocumentModelMigrationRefusal[]) {
    super(refusals.map(({ reason }) => reason).join("\n"));
  }
}

export function refuse(
  file: string,
  line: number | undefined,
  reason: string,
  repair: string,
): never {
  throw new Refused([
    { file, ...(line !== undefined && { line }), reason, repair },
  ]);
}

export const literal = (value: unknown) => JSON.stringify(value);

/** A file that can import a module: TypeScript or JavaScript, of any module kind. */
export const CODE_FILE = /\.[cm]?[jt]sx?$/;

/** Refuse location- or scope-sensitive code before moving or replacing its source. */
export function checkMovedSource(file: SourceFile, path: string): void {
  const directEval = directEvalCall(file);
  if (directEval !== undefined) {
    refuse(
      path,
      directEval.getStartLineNumber(),
      `${path} calls eval, which can read bindings and arguments changed by migration.`,
      "Replace direct eval with ordinary code before migrating this model.",
    );
  }
  const location = importMetaRead(file);
  if (location !== undefined) {
    refuse(
      path,
      location.getStartLineNumber(),
      `${path} reads import.meta, whose module location changes when the file moves. Relative asset URLs would then name a different location.`,
      "Keep this helper in a file the migration does not move, or pass its asset location explicitly.",
    );
  }
}

/** Where the models live, and the bare specifiers that name that directory. */
export type ModelsLayout = {
  /** Project-relative, such as `document-models`. */
  readonly modelsDir: string;
  /**
   * `document-models`, the tsconfig alias projects declare, and
   * `<package name>/<modelsDir>`, the package's own name for it.
   */
  readonly aliases: readonly string[];
};

export type Input = ModelsLayout & {
  readonly moduleReferences: readonly DocumentModelMigrationReference[];
  readonly files: Map<string, string>;
  readonly dirName: string;
  readonly renameConflictingTypes: boolean;
};

/** Whether `identifier` names a property (`a.name`, `{ name: 1 }`) rather than a binding. */
export function isPropertyName(identifier: Node): boolean {
  const parent = identifier.getParent();
  return (
    (Node.isPropertyAccessExpression(parent) &&
      parent.getNameNode() === identifier) ||
    (Node.isPropertyAssignment(parent) && parent.getNameNode() === identifier)
  );
}

export const GENERATED_HEADER =
  /^\/\*\*\n \* WARNING: DO NOT EDIT\n \* This file is auto-generated and updated by codegen\n(?: \*.*\n)*? \*\/\n/;

/** The names `file` exports, by ts-morph's reading of its declarations. */
export function exportedNames(file: SourceFile): Map<string, Node> {
  return new Map(
    [...file.getExportedDeclarations()].map(([name, nodes]) => [
      name,
      nodes[0]!,
    ]),
  );
}

export type ModulePlan = {
  readonly stored: StoredModule;
  readonly key: string;
  readonly pascal: string;
  readonly constName: string;
  /** Project-relative path of the module file. */
  readonly path: string;
  readonly reducerFile: string | undefined;
};

export type VersionContext = {
  readonly input: Input;
  readonly project: Project;
  readonly specification: StoredSpecification;
  readonly version: number;
  readonly dir: string;
  readonly specFile: string;
  readonly model: StoredModel;
  readonly modelPascal: string;
  readonly modelCamel: string;
  readonly types: Map<string, DeclaredType>;
  readonly globalRoot: string;
  readonly localRoot: string | undefined;
  /** Old name to new name, for each type renamed off a scalar's name. */
  readonly renamed: ReadonlyMap<string, string>;
  /** Error classes some code uses outside a reducer that declares them. */
  readonly errorsNeeded: Set<string>;
  /** Input types declared in the one module whose operations use them. */
  readonly inputHomes: Map<string, ModulePlan>;
  readonly notes: string[];
};

export function sourceFile(
  project: Project,
  input: Input,
  path: string,
): SourceFile {
  const existing = project.getSourceFile(`/${path}`);
  if (existing !== undefined) return existing;
  const text = input.files.get(path);
  if (text === undefined) {
    refuse(
      path,
      1,
      `${path} does not exist.`,
      "Restore the file, or regenerate the model with ph generate before migrating it.",
    );
  }
  return project.createSourceFile(`/${path}`, text);
}

export function unwrapExpression(node: Node): Node {
  let current = node;
  while (
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isParenthesizedExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isNonNullExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}
