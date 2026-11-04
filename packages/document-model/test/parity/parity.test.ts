import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { PARITY_PAIRS, type Twin } from "./corpus.js";
import { identityFree } from "./identity-free.js";
import { adaptOriginal, REPO_ROOT } from "./originals.js";
import { validatorSamples } from "./validator-matrix.js";

const ACTION_TYPES: Readonly<Record<string, string>> = {
  "document-drive v1":
    "powerhouse/document-drive ADD_FILE ADD_FOLDER DELETE_NODE UPDATE_FILE UPDATE_NODE COPY_NODE MOVE_NODE SET_DRIVE_NAME SET_DRIVE_ICON SET_SHARING_TYPE SET_AVAILABLE_OFFLINE ADD_LISTENER REMOVE_LISTENER ADD_TRIGGER REMOVE_TRIGGER",
  "reactor-group v1":
    "powerhouse/reactor-group SET_GROUP_NAME SET_GROUP_DESCRIPTION ADD_MEMBER REMOVE_MEMBER",
  "app-module v1":
    "powerhouse/app SET_APP_NAME SET_APP_STATUS ADD_DOCUMENT_TYPE REMOVE_DOCUMENT_TYPE SET_DOCUMENT_TYPES SET_DRAG_AND_DROP_ENABLED",
  "processor-module v1":
    "powerhouse/processor SET_PROCESSOR_NAME SET_PROCESSOR_TYPE ADD_DOCUMENT_TYPE REMOVE_DOCUMENT_TYPE ADD_PROCESSOR_APP REMOVE_PROCESSOR_APP SET_PROCESSOR_STATUS",
  "vetra-package v1":
    "powerhouse/package SET_PACKAGE_NAME SET_PACKAGE_DESCRIPTION SET_PACKAGE_CATEGORY SET_PACKAGE_AUTHOR SET_PACKAGE_AUTHOR_NAME SET_PACKAGE_AUTHOR_WEBSITE ADD_PACKAGE_KEYWORD REMOVE_PACKAGE_KEYWORD SET_PACKAGE_GITHUB_URL SET_PACKAGE_NPM_URL",
  "versioned-todo v1": "test/todo ADD_TODO REMOVE_TODO UPDATE_TODO",
  "versioned-todo v2": "test/todo ADD_TODO REMOVE_TODO UPDATE_TODO EDIT_TITLE",
  "extensions v1": "test/extensions SET_STATUS",
  "sample v1": "test/sample ADD_ENTRY",
};

const VALIDATOR_OUTCOMES: Readonly<Record<string, object>> = {
  "document-drive v1": { accepted: 52, rejected: 65, invalidScalar: 0 },
  "reactor-group v1": { accepted: 8, rejected: 12, invalidScalar: 0 },
  "app-module v1": { accepted: 12, rejected: 18, invalidScalar: 0 },
  "processor-module v1": { accepted: 14, rejected: 24, invalidScalar: 0 },
  "vetra-package v1": { accepted: 24, rejected: 36, invalidScalar: 4 },
  "versioned-todo v1": { accepted: 10, rejected: 17, invalidScalar: 0 },
  "versioned-todo v2": { accepted: 14, rejected: 18, invalidScalar: 0 },
};

const VERSIONS = PARITY_PAIRS.flatMap((pair) =>
  pair.versions.map((entry) => ({
    ...entry,
    label: `${pair.name} v${entry.version}`,
    original: adaptOriginal(pair.original, entry.version),
  })),
);

describe("identity-free definition parity", () => {
  it.each(VERSIONS)("$label", ({ label, version, twin, original }) => {
    const free = identityFree(twin.definition);
    expect(free).toStrictEqual(identityFree(original.definition));
    const specification = free.specifications.find(
      (entry) => entry.version === version,
    );
    expect(
      [
        free.model.documentType,
        ...(specification?.modules ?? []).flatMap((module) =>
          module.operations.map(({ actionType }) => actionType),
        ),
      ].join(" "),
    ).toBe(ACTION_TYPES[label]);
  });
});

type ZodModule = Readonly<
  Record<string, () => { safeParse(value: unknown): { success: boolean } }>
>;

async function loadZod(path: string): Promise<ZodModule> {
  return (await import(pathToFileURL(REPO_ROOT + path).href)) as ZodModule;
}

function twinAccepts(twin: Twin, operation: string, input: unknown): boolean {
  const creators = twin.actions as Record<string, (input: unknown) => unknown>;
  try {
    creators[operation](input);
    return true;
  } catch {
    return false;
  }
}

describe("validator parity", () => {
  it.each(VERSIONS.filter(({ zod }) => zod !== null))(
    "$label",
    async ({ label, version, twin, zod }) => {
      const validators = await loadZod(zod as string);
      const specification = twin.definition.specifications.find(
        (entry) => entry.version === version,
      );
      if (specification === undefined) throw new Error("no specification");
      const samples = validatorSamples(specification);
      const outcomes = samples.map((sample) => ({
        sample: `${sample.operation} ${sample.label}`,
        twin: twinAccepts(twin, sample.operation, sample.input),
        original: validators[`${sample.inputType}Schema`]().safeParse(
          sample.input,
        ).success,
      }));
      expect(
        outcomes.filter(({ twin, original }) => twin !== original),
      ).toStrictEqual([]);
      expect({
        accepted: outcomes.filter(({ original }) => original).length,
        rejected: outcomes.filter(({ original }) => !original).length,
        invalidScalar: samples.filter(({ label }) =>
          label.endsWith("invalid scalar"),
        ).length,
      }).toStrictEqual(VALIDATOR_OUTCOMES[label]);
    },
  );
});
