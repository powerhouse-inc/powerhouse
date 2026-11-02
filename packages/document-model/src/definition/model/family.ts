import type {
  DefinitionPath,
  UpgradeManifest,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import type { CompiledDocumentModelVersion } from "../compiler/compile.js";
import {
  rejectionReceived,
  snapshotArray,
  snapshotRecord,
} from "../kernel/data-properties.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { canonicalJson, compareCodeUnits } from "../kernel/primitives.js";
import { compiledVersionOf } from "./define-document-model.js";
import {
  type ModelCollector,
  modelCollector,
  optionalString,
  take,
  takeArray,
} from "./normalize.js";
import type {
  DocumentModelFamilyDefinition,
  DocumentModelVersionDefinition,
} from "./types.js";

type FamilyDeclaration = {
  readonly versions: readonly CompiledDocumentModelVersion[];
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
};

const familyDeclarations = new WeakMap<
  DocumentModelFamilyDefinition,
  FamilyDeclaration
>();

export function familyDeclarationOf(
  value: unknown,
): FamilyDeclaration | undefined {
  return value !== null && typeof value === "object"
    ? familyDeclarations.get(value as DocumentModelFamilyDefinition)
    : undefined;
}

function compiledVersions(
  collector: ModelCollector,
  value: unknown,
): readonly CompiledDocumentModelVersion[] {
  const versions = takeArray(collector, value, ["versions"]) ?? [];
  if (versions.length === 0) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["versions"],
      message: "A document-model family requires at least one version.",
      expected: "a nonempty version tuple",
      received: String(versions.length),
      repair: "List every version returned by context.version({ modules }).",
    });
  }
  return versions.flatMap((version, index) => {
    const compiled = compiledVersionOf(version);
    if (compiled !== undefined) return [compiled];
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["versions", index],
      message: "A family version must be a token returned by context.version.",
      expected: "an opaque version token",
      received: describeReceived(version),
      repair:
        "Pass context.version({ modules }) results; a version token is not registrable on its own.",
    });
    return [];
  });
}

function checkFamilyVersions(
  collector: ModelCollector,
  versions: readonly CompiledDocumentModelVersion[],
): void {
  const first = versions.at(0);
  if (first === undefined) return;
  const firstModel = canonicalJson(first.definition.model);
  versions.forEach((version, index) => {
    const path: DefinitionPath = ["versions", index];
    if (version.config.id !== first.config.id) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "documentType"],
        message: "Every version of a family must use one document type.",
        expected: first.config.id,
        received: version.config.id,
        repair: "Compose only the versions declared with the same model id.",
      });
      return;
    }
    const model = canonicalJson(version.definition.model);
    if (model !== firstModel) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "model"],
        message:
          "Family model metadata must be identical across versions, because the stored document model carries one copy of it.",
        expected: firstModel,
        received: model,
        repair:
          "Use the same name, description, extension, and author in every version of the family.",
      });
    }
    const previous = versions[index - 1];
    if (index === 0 || version.config.version === previous.config.version + 1)
      return;
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "version"],
      message:
        "Family versions must be unique, contiguous, and in ascending order, so the last entry is the latest.",
      expected: String(previous.config.version + 1),
      received: String(version.config.version),
      repair: "List every consecutive version once, in ascending order.",
    });
  });
}

const MANIFEST_KEYS = [
  "documentType",
  "latestVersion",
  "supportedVersions",
  "upgrades",
];
const TRANSITION_KEYS = ["toVersion", "upgradeReducer", "description"];

function numberText(value: unknown): string {
  return typeof value === "number" ? String(value) : describeReceived(value);
}

function checkUpgradeManifest(
  collector: ModelCollector,
  value: unknown,
  versions: readonly CompiledDocumentModelVersion[],
): UpgradeManifest<readonly number[]> | undefined {
  const path: DefinitionPath = ["upgradeManifest"];
  if (value === undefined) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message: "A document-model family requires its upgrade manifest.",
      expected: "the manifest exported by upgrades/upgrade-manifest.ts",
      received: "absent",
      repair:
        "Pass the manifest that lists every version and the upgrade into each one after the first.",
    });
    return undefined;
  }
  const manifest = take(
    collector,
    snapshotRecord(value, MANIFEST_KEYS, path),
    MANIFEST_KEYS,
  );
  const first = versions.at(0);
  if (manifest === undefined || first === undefined) return undefined;
  const numbers = versions.map((version) => version.config.version);

  if (manifest.documentType !== first.config.id) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "documentType"],
      message: "The upgrade manifest names a different document type.",
      expected: first.config.id,
      received:
        typeof manifest.documentType === "string"
          ? manifest.documentType
          : describeReceived(manifest.documentType),
      repair: "Use the id every version of the family declares.",
    });
  }
  const supported = snapshotArray(manifest.supportedVersions, [
    ...path,
    "supportedVersions",
  ]);
  const sameVersions =
    supported.ok &&
    supported.value.length === numbers.length &&
    supported.value.every((version, index) => version === numbers[index]);
  if (!sameVersions) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "supportedVersions"],
      message: "The upgrade manifest and the family list different versions.",
      expected: JSON.stringify(numbers),
      received: supported.ok
        ? JSON.stringify(supported.value)
        : rejectionReceived(supported),
      repair: "List every version the family composes, in ascending order.",
    });
  }
  if (manifest.latestVersion !== numbers.at(-1)) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: [...path, "latestVersion"],
      message:
        "The upgrade manifest's latest version is not the family's last.",
      expected: String(numbers.at(-1)),
      received: numberText(manifest.latestVersion),
      repair: "Set latestVersion to the last entry of supportedVersions.",
    });
  }

  const upgradesPath: DefinitionPath = [...path, "upgrades"];
  const upgrades = take(
    collector,
    snapshotRecord(manifest.upgrades, undefined, upgradesPath),
    [],
  );
  if (upgrades === undefined) return undefined;
  const expected = numbers.slice(1).map((version) => `v${version}`);
  const actual = Object.keys(upgrades).sort(compareCodeUnits);
  if (
    expected.length !== actual.length ||
    expected.some((key) => !actual.includes(key))
  ) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: upgradesPath,
      message:
        "A family needs exactly one upgrade transition for every version after the first.",
      expected: expected.join(", ") || "no transitions",
      received: actual.join(", ") || "no transitions",
      repair:
        "Key each transition by the version it upgrades to, as upgrades: { v2 }.",
    });
  }

  const checked: Record<string, UpgradeTransition> = {};
  for (const version of numbers.slice(1)) {
    const key = `v${version}`;
    if (!Object.hasOwn(upgrades, key)) continue;
    const transitionPath: DefinitionPath = [...upgradesPath, key];
    const transition = take(
      collector,
      snapshotRecord(upgrades[key], TRANSITION_KEYS, transitionPath),
      TRANSITION_KEYS,
    );
    if (transition === undefined) continue;
    if (transition.toVersion !== version) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...transitionPath, "toVersion"],
        message: `The transition under ${key} must target version ${version}.`,
        expected: String(version),
        received: numberText(transition.toVersion),
        repair: "Set toVersion to the version the transition is keyed by.",
      });
    }
    if (typeof transition.upgradeReducer !== "function") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...transitionPath, "upgradeReducer"],
        message: "An upgrade transition must carry a callable upgradeReducer.",
        expected: "a function",
        received:
          transition.upgradeReducer === undefined
            ? "absent"
            : describeReceived(transition.upgradeReducer),
        repair:
          "Write the upgrade by hand: it rewrites both state and initialState.",
      });
    }
    const description = optionalString(collector, transition.description, [
      ...transitionPath,
      "description",
    ]);
    checked[key] = {
      toVersion: version,
      upgradeReducer:
        transition.upgradeReducer as UpgradeTransition["upgradeReducer"],
      ...(typeof description === "string" ? { description } : {}),
    };
  }
  return {
    documentType: first.config.id,
    latestVersion: numbers[numbers.length - 1],
    supportedVersions: numbers,
    upgrades: checked,
  };
}

export function copyUpgradeManifest(
  manifest: UpgradeManifest<readonly number[]>,
): UpgradeManifest<readonly number[]> {
  const upgrades: Record<string, UpgradeTransition> = {};
  for (const [key, transition] of Object.entries(manifest.upgrades)) {
    upgrades[key] = { ...(transition as UpgradeTransition) };
  }
  return {
    documentType: manifest.documentType,
    latestVersion: manifest.latestVersion,
    supportedVersions: [...manifest.supportedVersions],
    upgrades,
  };
}

/**
 * @experimental Composes the versions of one document type with the upgrade
 * manifest that moves a document between them. `materialize` turns the
 * result into one module per version.
 */
export function defineDocumentModelFamily<
  const TVersions extends readonly DocumentModelVersionDefinition[],
>(config: {
  readonly versions: TVersions;
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
}): DocumentModelFamilyDefinition<TVersions> {
  const collector = modelCollector();
  const declaration = take(
    collector,
    snapshotRecord(config, ["versions", "upgradeManifest"], []),
    ["versions", "upgradeManifest"],
  );
  collector.throwIfFailed();
  const versions = compiledVersions(collector, declaration?.versions);
  collector.throwIfFailed();
  checkFamilyVersions(collector, versions);
  const upgradeManifest = checkUpgradeManifest(
    collector,
    declaration?.upgradeManifest,
    versions,
  );
  collector.throwIfFailed();
  const first = versions.at(0);
  if (first === undefined || upgradeManifest === undefined) {
    throw new TypeError(
      "A document-model family requires at least one version.",
    );
  }
  const token = {
    kind: "powerhouse.document-model-family",
    documentType: first.config.id,
  } as const;
  familyDeclarations.set(token, { versions, upgradeManifest });
  return token;
}
