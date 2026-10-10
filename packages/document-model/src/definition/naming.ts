import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { camelCase, constantCase, pascalCase } from "change-case";
import { createDiagnostic } from "./diagnostics.js";

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

type ActionTypeWords<
  TKey extends string,
  TPrevious extends string = "",
  TResult extends string = "",
  TSeparator extends string = "",
> = TKey extends `${infer TFirst}${infer TRest}`
  ? TFirst extends "_"
    ? ActionTypeWords<TRest, "", TResult, TResult extends "" ? "" : "_">
    : ActionTypeWords<
        TRest,
        TFirst,
        `${TResult}${TSeparator extends "_"
          ? "_"
          : TFirst extends Lowercase<TFirst>
            ? ""
            : TPrevious extends ""
              ? ""
              : TPrevious extends Digit
                ? "_"
                : TPrevious extends Uppercase<TPrevious>
                  ? TRest extends `${infer TNext}${string}`
                    ? TNext extends Uppercase<TNext>
                      ? ""
                      : "_"
                    : ""
                  : "_"}${Uppercase<TFirst>}`
      >
  : TResult;

/** The constantCase spelling of an authored ASCII GraphQL operation key. */
export type DocumentModelActionType<TKey extends string> = string extends TKey
  ? string
  : ActionTypeWords<TKey>;

export type DocumentModelNames = {
  readonly documentType: string;
  readonly graphQLName: string;
  readonly globalStateRootName: string;
  readonly localStateRootName: string;
};

export type DocumentModelModuleNames = {
  readonly storedName: string;
  readonly operationsInterfaceName: string;
  readonly actionNamespaceName: string;
};

export type DocumentModelOperationNames = {
  readonly storedName: string;
  readonly actionType: string;
  readonly inputTypeName: string;
  readonly creatorKey: string;
  readonly reducerMethod: string;
};

export type DocumentModelErrorNames = {
  readonly key: string;
  readonly storedName: string;
  readonly storedCode: string;
};

export function deriveDocumentModelNames(
  model: { readonly id: string; readonly name: string },
  overrides: Partial<DocumentModelNames> = {},
): DocumentModelNames {
  const graphQLName = overrides.graphQLName ?? pascalCase(model.name);
  return {
    documentType: overrides.documentType ?? model.id,
    graphQLName,
    globalStateRootName: overrides.globalStateRootName ?? `${graphQLName}State`,
    localStateRootName:
      overrides.localStateRootName ?? `${graphQLName}LocalState`,
  };
}

export function deriveDocumentModelModuleNames(
  modelName: string,
  moduleKey: string,
  overrides: Partial<DocumentModelModuleNames> = {},
): DocumentModelModuleNames {
  const modulePascal = pascalCase(moduleKey);
  return {
    storedName: overrides.storedName ?? modulePascal,
    operationsInterfaceName:
      overrides.operationsInterfaceName ??
      `${pascalCase(modelName)}${modulePascal}Operations`,
    actionNamespaceName:
      overrides.actionNamespaceName ??
      `${camelCase(modelName)}${modulePascal}Actions`,
  };
}

export function deriveDocumentModelOperationNames(
  operationKey: string,
  overrides: Partial<DocumentModelOperationNames> = {},
): DocumentModelOperationNames {
  const operationPascal = pascalCase(operationKey);
  const actionType = overrides.actionType ?? constantCase(operationKey);
  return {
    storedName: overrides.storedName ?? operationPascal,
    actionType,
    inputTypeName: overrides.inputTypeName ?? `${operationPascal}Input`,
    creatorKey: overrides.creatorKey ?? camelCase(constantCase(operationKey)),
    reducerMethod:
      overrides.reducerMethod ?? `${camelCase(operationKey)}Operation`,
  };
}

/**
 * The generator derives an error class name, its `errorCode`, and its default
 * message from `pascalCase(specification name)`. A code-first error key is the
 * class name directly, so the two agree only when the key is already in that
 * form; the compiler checks that with this derivation.
 */
export function deriveOperationErrorClassName(storedName: string): string {
  return pascalCase(storedName);
}

export function deriveDocumentModelErrorNames(
  errorKey: string,
  authored: {
    readonly name?: string | null;
    readonly code?: string | null;
  } = {},
): DocumentModelErrorNames {
  return {
    key: errorKey,
    storedName: authored.name ?? errorKey,
    storedCode: authored.code ?? errorKey,
  };
}

/**
 * The names the current generator derives from a stored operation name, and
 * the logical key a code-first author writes for the same operation. The
 * schema-first adapter reads these instead of calling `change-case` itself:
 * one module owns the derivation rules, so the two approaches cannot drift.
 */
export type SchemaFirstOperationNames = DocumentModelOperationNames & {
  readonly key: string;
};

export function deriveSchemaFirstOperationNames(
  storedName: string,
): SchemaFirstOperationNames {
  const key = camelCase(constantCase(storedName));
  return {
    key,
    storedName,
    actionType: constantCase(storedName),
    inputTypeName: `${pascalCase(storedName)}Input`,
    creatorKey: camelCase(constantCase(storedName)),
    reducerMethod: `${camelCase(storedName)}Operation`,
  };
}

/** The logical key a code-first author writes for a stored module name. */
export function deriveSchemaFirstModuleKey(storedName: string): string {
  return camelCase(storedName);
}

/**
 * The reducer-facing error key: the generated class name, which the current
 * generator derives from the stored error `name`, never from its `code`.
 */
export function deriveSchemaFirstErrorKey(storedName: string): string {
  return pascalCase(storedName);
}

/**
 * Whether a stored name ever produced a runtime symbol. A stored value that
 * did not blocks conversion; the adapter never invents a replacement.
 */
export function producesRuntimeSymbol(name: string | null): name is string {
  return (
    typeof name === "string" &&
    name.trim() !== "" &&
    pascalCase(name) !== "" &&
    constantCase(name) !== "" &&
    camelCase(name) !== ""
  );
}

export type DerivedOperationNames = {
  readonly key: string;
  readonly names: DocumentModelOperationNames;
};

export type DerivedModuleNames = {
  readonly key: string;
  readonly names: DocumentModelModuleNames;
  readonly operations: readonly DerivedOperationNames[];
};

type Claim = {
  readonly path: readonly string[];
  readonly label: string;
};

type NameClaim = {
  readonly kind: string;
  readonly slot: string;
  readonly value: string;
};

type Collision = {
  readonly first: Claim;
  readonly names: string[];
  actionType: boolean;
};

const MODULE_NAME_KINDS = [
  "storedName",
  "operationsInterfaceName",
  "actionNamespaceName",
] as const satisfies readonly (keyof DocumentModelModuleNames)[];

const OPERATION_NAME_KINDS = [
  "actionType",
  "storedName",
  "inputTypeName",
  "creatorKey",
  "reducerMethod",
] as const satisfies readonly (keyof DocumentModelOperationNames)[];

function nameSlot(
  owner: "module" | "operation",
  scope: string,
  kind: string,
  value: string,
): string {
  return JSON.stringify([owner, scope, kind, value]);
}

function moduleNameClaims(
  names: DocumentModelModuleNames,
): readonly NameClaim[] {
  return MODULE_NAME_KINDS.map((kind) => ({
    kind,
    slot: nameSlot("module", "model", kind, names[kind]),
    value: names[kind],
  }));
}

function operationNameClaims(
  moduleKey: string,
  names: DocumentModelOperationNames,
): readonly NameClaim[] {
  return OPERATION_NAME_KINDS.map((kind) => {
    const scope =
      kind === "storedName" || kind === "reducerMethod" ? moduleKey : "model";
    return {
      kind,
      slot: nameSlot("operation", scope, kind, names[kind]),
      value: names[kind],
    };
  });
}

function claim(
  claims: Map<string, Claim>,
  claimant: Claim,
  nameClaims: readonly NameClaim[],
): readonly Collision[] {
  const collisions = new Map<Claim, Collision>();
  for (const { kind, slot, value } of nameClaims) {
    const first = claims.get(slot);
    if (first === undefined) {
      claims.set(slot, claimant);
      continue;
    }
    const collision = collisions.get(first) ?? {
      first,
      names: [],
      actionType: false,
    };
    collision.names.push(`${kind} ${JSON.stringify(value)}`);
    if (kind === "actionType") collision.actionType = true;
    collisions.set(first, collision);
  }
  return [...collisions.values()];
}

function collisionDiagnostic(
  claimant: Claim,
  collision: Collision,
): DefinitionDiagnostic {
  const list = collision.names.join(", ");
  return createDiagnostic({
    code: collision.actionType
      ? "PH-DM-DUPLICATE-ACTION"
      : "PH-DM-DUPLICATE-NAME",
    path: claimant.path,
    message: `${claimant.label} derives ${list}, already derived by ${collision.first.label}.`,
    expected: `distinct derived names for ${claimant.label} and ${collision.first.label}`,
    received: list,
    repair: `Rename ${claimant.label} or ${collision.first.label} so their derived names differ.`,
    related: [
      {
        path: collision.first.path,
        message: `${collision.first.label} derives the same ${collision.names.length === 1 ? "name" : "names"}.`,
      },
    ],
  });
}

/** One pass over every module and operation, O(operations) in time. */
export function checkDerivedNameCollisions(
  modules: readonly DerivedModuleNames[],
): readonly DefinitionDiagnostic[] {
  const claims = new Map<string, Claim>();
  const diagnostics: DefinitionDiagnostic[] = [];
  for (const module of modules) {
    const moduleClaim: Claim = {
      path: ["modules", module.key],
      label: `module ${JSON.stringify(module.key)}`,
    };
    for (const collision of claim(
      claims,
      moduleClaim,
      moduleNameClaims(module.names),
    )) {
      diagnostics.push(collisionDiagnostic(moduleClaim, collision));
    }
    for (const operation of module.operations) {
      const operationClaim: Claim = {
        path: ["modules", module.key, "operations", operation.key],
        label: `operation ${JSON.stringify(`${module.key}.${operation.key}`)}`,
      };
      for (const collision of claim(
        claims,
        operationClaim,
        operationNameClaims(module.key, operation.names),
      )) {
        diagnostics.push(collisionDiagnostic(operationClaim, collision));
      }
    }
  }
  return diagnostics;
}
