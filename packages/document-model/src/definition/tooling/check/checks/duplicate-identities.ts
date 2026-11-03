import type {
  DefinitionDiagnostic,
  DefinitionPath,
} from "@powerhousedao/shared/document-model";
import {
  deriveOperationErrorClassName,
  PLATFORM_ACTION_TYPES,
} from "../../../compiler/naming.js";
import type { NormalizedDocumentModelArtifact } from "../../adapters/types.js";
import {
  type CheckDiagnosticCode,
  checkDiagnostics,
} from "../diagnostic-codes.js";
import {
  documentModelRef,
  servedSpecification,
} from "../../report/served-specification.js";
import type { DefinitionCheck } from "../types.js";

type Claim = { readonly path: DefinitionPath; readonly label: string };

/** Codegen's rule: an empty or absent code falls back to the class name. */
function effectiveErrorCode(code: string | null, className: string): string {
  return code?.trim() || className;
}

/**
 * The compiler refuses duplicate module keys, action types and creator keys,
 * an action type the document runtime owns, and an error class with two codes
 * in one module, before a code-first module exists, so for those this check fires only on a stored schema-first model.
 * Two errors of one operation sharing a code pass the compiler in both modes.
 */
function duplicates(
  artifact: NormalizedDocumentModelArtifact,
): readonly DefinitionDiagnostic[] {
  const served = servedSpecification(artifact);
  if (served === undefined) return [];
  const { specification, index } = served;
  const diagnostics: DefinitionDiagnostic[] = [];
  const report = (
    code: CheckDiagnosticCode,
    claimant: Claim,
    first: Claim,
    detail: {
      readonly message: string;
      readonly expected: string;
      readonly received: string;
      readonly repair: string;
    },
  ) =>
    diagnostics.push(
      checkDiagnostics.create({
        code,
        source: artifact.source,
        definition: documentModelRef(artifact),
        path: claimant.path,
        ...detail,
        related: [
          {
            source: artifact.source,
            path: first.path,
            message: `${first.label} claims it first.`,
          },
        ],
      }),
    );
  const shared = (
    code: CheckDiagnosticCode,
    claimant: Claim,
    first: Claim,
    [kind, value]: readonly [string, string],
    repair: string,
  ) =>
    report(code, claimant, first, {
      message: `${claimant.label} and ${first.label} share the ${kind} ${value}.`,
      expected: `one declaration per ${kind}`,
      received: value,
      repair,
    });

  const modules = new Map<string, Claim>();
  const actionTypes = new Map<string, Claim>();
  const operationKeys = new Map<string, Claim>();
  specification.modules.forEach((module, moduleIndex) => {
    const modulePath = ["specifications", index, "modules", moduleIndex];
    const moduleClaim = {
      path: modulePath,
      label: `module ${JSON.stringify(module.key)}`,
    };
    const firstModule = modules.get(module.key);
    if (firstModule === undefined) modules.set(module.key, moduleClaim);
    else {
      shared(
        "PH-DM-DUPLICATE-NAME",
        moduleClaim,
        firstModule,
        ["key", module.key],
        "Rename one of the modules.",
      );
    }
    const errorClasses = new Map<string, Claim & { readonly code: string }>();
    module.operations.forEach((operation, operationIndex) => {
      const operationPath = [...modulePath, "operations", operationIndex];
      const claim = {
        path: operationPath,
        label: `operation ${JSON.stringify(`${module.key}.${operation.key}`)}`,
      };
      if (PLATFORM_ACTION_TYPES.has(operation.actionType)) {
        diagnostics.push(
          checkDiagnostics.create({
            code: "PH-DM-DUPLICATE-ACTION",
            source: artifact.source,
            definition: documentModelRef(artifact),
            path: [...operationPath, "key"],
            message: `${claim.label} has action type ${operation.actionType}, which the document runtime reduces itself, so this operation's reducer would never run.`,
            expected: "an action type the document runtime does not own",
            received: operation.actionType,
            repair: "Rename the operation.",
          }),
        );
      }
      const firstAction = actionTypes.get(operation.actionType);
      const firstKey = operationKeys.get(operation.key);
      if (firstAction !== undefined) {
        shared(
          "PH-DM-DUPLICATE-ACTION",
          claim,
          firstAction,
          ["action type", operation.actionType],
          "Rename one of the operations; a replayed history cannot tell which reducer wrote a shared action type.",
        );
      } else if (firstKey !== undefined) {
        shared(
          "PH-DM-DUPLICATE-NAME",
          claim,
          firstKey,
          ["creator key", operation.key],
          "Rename one of the operations; action creators share one namespace.",
        );
      }
      actionTypes.set(operation.actionType, firstAction ?? claim);
      operationKeys.set(operation.key, firstKey ?? claim);

      const errorKeys = new Map<string, Claim>();
      const errorCodes = new Map<string, Claim>();
      operation.errors.forEach((error, errorIndex) => {
        const errorClaim = {
          path: [...operationPath, "errors", errorIndex],
          label: `error ${JSON.stringify(error.key)}`,
        };
        const className = deriveOperationErrorClassName(
          error.name ?? error.key,
        );
        const code = effectiveErrorCode(error.code, className);
        const sameKey = errorKeys.get(error.key);
        const sameCode = errorCodes.get(code);
        const sameClass = errorClasses.get(className);
        if (sameKey !== undefined) {
          shared(
            "PH-DM-DUPLICATE-NAME",
            errorClaim,
            sameKey,
            ["key", error.key],
            "Rename one of the errors; each generates its own class.",
          );
        } else if (sameCode !== undefined) {
          shared(
            "PH-DM-DUPLICATE-ERROR-CODE",
            errorClaim,
            sameCode,
            ["code", code],
            "Give each error of the operation its own code, so a caller can tell them apart.",
          );
        } else if (sameClass !== undefined && sameClass.code !== code) {
          report("PH-DM-ERROR-CLASS-CONFLICT", errorClaim, sameClass, {
            message: `${errorClaim.label} of ${claim.label} gives the error class ${className} the code ${JSON.stringify(code)}, and ${sameClass.label} gives it ${JSON.stringify(sameClass.code)}.`,
            expected: sameClass.code,
            received: code,
            repair: `Give both ${className} errors the same code, or give one another name; a module generates one ${className} class.`,
          });
        }
        errorKeys.set(error.key, sameKey ?? errorClaim);
        errorCodes.set(code, sameCode ?? errorClaim);
        if (sameClass === undefined) {
          errorClasses.set(className, {
            ...errorClaim,
            label: `${errorClaim.label} of ${claim.label}`,
            code,
          });
        }
      });
    });
  });
  return diagnostics;
}

export const duplicateIdentitiesCheck: DefinitionCheck = {
  name: "duplicate-identities",
  run: ({ artifacts }) => artifacts.flatMap(duplicates),
};
