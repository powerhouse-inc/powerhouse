import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs, MigrationPlan } from "file-builders";

type UpgradeTransitionTemplateArgs = DocumentModelFileMakerArgs & {
  plan: MigrationPlan;
};

/**
 * The generated v{N}.ts upgrade transition. Written once and never
 * overwritten, so hand edits survive regeneration.
 *
 * For mechanical schema changes the migration is derived: fields added in
 * the new version are initialized (from the new version's initial value or
 * the schema's zero value) and existing data is preserved. When the change
 * cannot be derived — a field changed type, a nested type changed shape —
 * the reducer throws until the migration is hand-written: silently running
 * a no-op migration would stamp documents with a version whose schema their
 * state does not satisfy, crashing every consumer that validates them.
 */
export const upgradeTransitionTemplate = (v: UpgradeTransitionTemplateArgs) => {
  const body =
    v.plan.kind === "manual"
      ? manualReducer(v, v.plan.reason)
      : fillReducer(v, v.plan.fills);

  return ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { ${v.phStateName} as StateV${v.version - 1} } from "${v.documentModelImportPath}/v${v.version - 1}";
import type { ${v.phStateName} as StateV${v.version} } from "${v.documentModelImportPath}/v${v.version}";

${body}

export const v${v.version}: UpgradeTransition = {
  toVersion: ${v.version},
  upgradeReducer,
  description: "",
};
`.raw;
};

function manualReducer(v: UpgradeTransitionTemplateArgs, reason: string) {
  const message = `The ${v.documentModelState.id} v${v.version} migration is not implemented: ${reason}. Implement it in document-models/${v.documentModelDirName}/upgrades/v${v.version}.ts.`;
  return `
/*
 * This migration could not be derived automatically: ${reason}.
 * Implement it (migrate BOTH state and initialState), then remove the throw.
 */
function upgradeReducer(
  document: PHDocument<StateV${v.version - 1}>,
  action: Action,
): PHDocument<StateV${v.version}> {
  throw new Error(${JSON.stringify(message)});
}
`;
}

function fillReducer(
  v: UpgradeTransitionTemplateArgs,
  fills: { global?: Record<string, unknown>; local?: Record<string, unknown> },
) {
  const fillConsts: string[] = [];
  const scopeLines = (source: "state" | "initialState") =>
    (["global", "local"] as const)
      .filter((scope) => fills[scope])
      .map(
        (scope) =>
          `      ${scope}: { ...added${capitalize(scope)}Fields, ...document.${source}.${scope} },`,
      )
      .join("\n");

  for (const scope of ["global", "local"] as const) {
    const fill = fills[scope];
    if (!fill) continue;
    fillConsts.push(
      `const added${capitalize(scope)}Fields = ${JSON.stringify(fill, null, 2)} satisfies Partial<StateV${v.version}["${scope}"]>;`,
    );
  }

  if (fillConsts.length === 0) {
    return `
/*
 * No fields were added between v${v.version - 1} and v${v.version}, so existing state
 * carries over unchanged.
 */
function upgradeReducer(
  document: PHDocument<StateV${v.version - 1}>,
  action: Action,
): PHDocument<StateV${v.version}> {
  return {
    ...document,
  };
}
`;
  }

  return `
${fillConsts.join("\n\n")}

/*
 * Fields added in v${v.version} are initialized from the new version's initial
 * value (or the schema's zero value); existing data wins for every field
 * that already existed. Both state and initialState are migrated so a
 * rebuild from the operation log converges with the stored state.
 */
function upgradeReducer(
  document: PHDocument<StateV${v.version - 1}>,
  action: Action,
): PHDocument<StateV${v.version}> {
  return {
    ...document,
    state: {
      ...document.state,
${scopeLines("state")}
    },
    initialState: {
      ...document.initialState,
${scopeLines("initialState")}
    },
  };
}
`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
