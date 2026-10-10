import type {
  DefinitionPath,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import type {
  NameOverrides,
  SchemaFirstSpecificationCompatibility,
} from "./compatibility.js";
import type { DefinitionDiagnosticCollector } from "./diagnostics.js";
import {
  type DefinitionIdentityRequest,
  definitionIdentityKey,
  deriveDefinitionId,
} from "./identity.js";
import { canonicalJson } from "./primitives.js";

/** What a declaration selected, and the authored paths that selected it. */
export type CompatibilitySelection = {
  readonly identity: "derived-v1" | "explicit-schema-first";
  readonly serialization: "canonical-v1" | "explicit-schema-first";
  readonly paths: {
    readonly ids: readonly string[];
    readonly names: readonly string[];
    readonly serialization: readonly string[];
  };
};

/**
 * Applies a compatibility declaration during compilation, and answers for it
 * afterwards.
 *
 * Every override is claimed as it is used, so `finish` can report the two
 * failures an author actually makes: an override for a path the declaration
 * does not have, and a missing override for a path it does. Identity is
 * all-or-nothing — a partial ID map would silently derive the rest and
 * change stored bytes — while serialization and names are per-path, because
 * only some stored strings differ from canonical output.
 */
export class AppliedCompatibility {
  readonly #collector: DefinitionDiagnosticCollector;
  readonly #compatibility: SchemaFirstSpecificationCompatibility | null;
  readonly #claimedIds = new Set<string>();
  readonly #claimedNames = new Set<string>();
  readonly #claimedSerialization = new Set<string>();
  readonly #missingIds: string[] = [];

  constructor(
    collector: DefinitionDiagnosticCollector,
    compatibility: SchemaFirstSpecificationCompatibility | null,
  ) {
    this.#collector = collector;
    this.#compatibility = compatibility;
  }

  /** Explicit identity is selected by supplying any stored ID. */
  get identityMode(): "derived-v1" | "explicit-schema-first" {
    return (this.#compatibility?.ids.size ?? 0) > 0
      ? "explicit-schema-first"
      : "derived-v1";
  }

  /** Explicit serialization is selected by retaining any stored string. */
  get serializationMode(): "canonical-v1" | "explicit-schema-first" {
    return (this.#compatibility?.serialization.size ?? 0) > 0
      ? "explicit-schema-first"
      : "canonical-v1";
  }

  /**
   * The stored ID for one item, or the derived one. Selecting explicit
   * identity does not retain a stored string and does not select the AST
   * projection.
   */
  id(
    request: DefinitionIdentityRequest,
    path: DefinitionPath,
  ): { readonly ok: true; readonly id: string } | { readonly ok: false } {
    const key = definitionIdentityKey(request);
    const derived = deriveDefinitionId(request, path);
    if (this.identityMode === "derived-v1") {
      if (derived.ok) return { ok: true, id: derived.id };
      this.#collector.merge([derived.diagnostic]);
      return { ok: false };
    }
    const override = this.#compatibility?.ids.get(key);
    if (override === undefined) {
      // Keep compiling on the derived ID so one missing entry reports every
      // other problem too, and record the gap for `finish`.
      this.#missingIds.push(key);
      this.#collector.add({
        code: "PH-DM-IDENTITY-INVALID",
        path,
        message: `This declaration carries explicit identity, but no stored ID was supplied for ${key}.`,
        expected: `ids[${JSON.stringify(key)}]`,
        received: "absent",
        repair: `Add ${JSON.stringify(key)} to the compatibility ids map with the exact stored ID.`,
      });
      return derived.ok ? { ok: true, id: derived.id } : { ok: false };
    }
    this.#claimedIds.add(key);
    return { ok: true, id: override };
  }

  /** The stored names for one module or operation, where they were overridden. */
  names(key: string): NameOverrides {
    const overrides = this.#compatibility?.names.get(key);
    if (overrides === undefined) return {};
    this.#claimedNames.add(key);
    return overrides;
  }

  /**
   * The retained stored string for a serialization path, or the canonical
   * one. A retained SDL segment is checked by the tooling parser in
   * `checkDefinitions` before publication; a retained JSON value is checked
   * here, because the runtime entry can parse JSON without loading a GraphQL
   * runtime.
   */
  serialization(path: string, canonical: string): string {
    const override = this.#compatibility?.serialization.get(path);
    if (override === undefined) return canonical;
    this.#claimedSerialization.add(path);
    return override;
  }

  /**
   * A retained initial value has to describe the same value the declaration
   * does. This runs synchronously at finalization.
   */
  initialValue(
    path: string,
    canonical: string,
    value: JsonValue,
    at: DefinitionPath,
  ): string {
    const override = this.#compatibility?.serialization.get(path);
    if (override === undefined) return canonical;
    this.#claimedSerialization.add(path);
    // Code generation already reads an empty stored local value as `{}`
    // (`codegen/src/utils/unsafe-utils.ts`), so the two spellings of an
    // empty scope are the same value.
    if (override.trim() === "" && canonicalJson(value) === "{}") {
      return override;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(override);
    } catch (error) {
      this.#collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: at,
        message: `The retained initial value is not JSON: ${error instanceof Error ? error.message : String(error)}`,
        expected: "the stored JSON string of this scope",
        received: override,
        repair:
          "Copy the exact stored initialValue string; a retained string that cannot be parsed cannot be checked.",
      });
      return canonical;
    }
    const retained = canonicalJson(parsed);
    const declared = canonicalJson(value);
    if (retained !== declared) {
      this.#collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: at,
        message:
          "The retained initial value describes a different value than the declaration.",
        expected: declared,
        received: retained,
        repair:
          "Make the declaration's initialValue equal to the stored one, or drop the override.",
      });
    }
    return override;
  }

  /**
   * Which modes this declaration selected and the authored paths that
   * selected them, so a check report can show a reviewer at a glance which
   * models carry compatibility data.
   */
  get selection(): CompatibilitySelection {
    return {
      identity: this.identityMode,
      serialization: this.serializationMode,
      paths: {
        ids: [...this.#claimedIds].sort(),
        names: [...this.#claimedNames].sort(),
        serialization: [...this.#claimedSerialization].sort(),
      },
    };
  }

  /** Reports surplus overrides and incomplete identity, once, at the end. */
  finish(): void {
    if (this.#compatibility === null) return;
    for (const key of this.#compatibility.ids.keys()) {
      if (this.#claimedIds.has(key)) continue;
      this.#collector.add({
        code: "PH-DM-IDENTITY-INVALID",
        path: ["compatibility", "ids", key],
        message: `The identity override ${JSON.stringify(key)} has no declaration to apply to.`,
        expected: "an identity path this declaration carries",
        received: key,
        repair:
          "Remove the entry, or add the module, operation, error, or example it names.",
      });
    }
    for (const key of this.#compatibility.names.keys()) {
      if (this.#claimedNames.has(key)) continue;
      this.#collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: ["compatibility", "names", key],
        message: `The name override ${JSON.stringify(key)} has no declaration to apply to.`,
        expected: "a module or operation this declaration carries",
        received: key,
        repair: "Remove the entry, or add the module or operation it names.",
      });
    }
    for (const key of this.#compatibility.serialization.keys()) {
      if (this.#claimedSerialization.has(key)) continue;
      this.#collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: ["compatibility", "serialization", key],
        message: `The serialization override ${JSON.stringify(key)} has no stored string to retain.`,
        expected: "a state scope or operation this declaration carries",
        received: key,
        repair:
          "Remove the entry, or add the operation whose stored schema it retains.",
      });
    }
  }
}
