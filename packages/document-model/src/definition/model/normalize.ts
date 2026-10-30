import type {
  DefinitionPath,
  DefinitionRef,
} from "@powerhousedao/shared/document-model";
import type { DefinitionExampleDeclaration } from "../compiler/compile.js";
import {
  type DataSnapshot,
  rejectionReceived,
  snapshotArray,
  snapshotDataRecord,
} from "../kernel/data-properties.js";
import { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";
import { describeReceived } from "../kernel/diagnostics.js";
import {
  type ModelDiagnosticCode,
  modelDiagnostics,
} from "./diagnostic-codes.js";

export type ModelCollector = DefinitionDiagnosticCollector<ModelDiagnosticCode>;

export function modelCollector(definition?: DefinitionRef): ModelCollector {
  return new DefinitionDiagnosticCollector(modelDiagnostics, definition);
}

export function take<T>(
  collector: ModelCollector,
  snapshot: DataSnapshot<T>,
  allowedKeys: readonly string[],
  unknownKeyCode: ModelDiagnosticCode = "PH-DM-DECLARATION-INVALID",
  repair = "Pass a plain object literal with enumerable string-keyed data properties and no accessors, symbols, or class instances.",
): T | undefined {
  if (snapshot.ok) return snapshot.value;
  const path = snapshot.path.map((segment) =>
    typeof segment === "number" ? segment : String(segment),
  );
  if (snapshot.reason === "unknown-key") {
    collector.add({
      code: unknownKeyCode,
      path,
      message: `Option ${JSON.stringify(snapshot.key)} is not supported here.`,
      expected: allowedKeys.join(", "),
      received: snapshot.key,
      repair: `Remove ${JSON.stringify(snapshot.key)}; the supported options are ${allowedKeys.join(", ")}.`,
    });
  } else if (
    snapshot.reason === "custom-prototype" &&
    snapshot.expected === "array"
  ) {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message:
        "Expected a plain array, not an Array subclass or an array from another realm.",
      received: snapshot.received,
      repair: "Pass an array literal, or copy the array with Array.from(...).",
    });
  } else {
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message: `The option value could not be snapshotted (${snapshot.reason}).`,
      received: rejectionReceived(snapshot),
      repair,
    });
  }
  return undefined;
}

export function takeArray(
  collector: ModelCollector,
  value: unknown,
  path: DefinitionPath,
): readonly unknown[] | undefined {
  return take(
    collector,
    snapshotArray(value, path),
    [],
    undefined,
    "Pass an array literal of data values with no holes, extra properties, accessors, or proxies.",
  );
}

export function requiredString(
  collector: ModelCollector,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: "This declaration member must be a nonempty string.",
    expected: "a nonempty string",
    received: value === undefined ? "absent" : describeReceived(value),
    repair: `Give ${String(path.at(-1) ?? "the member")} a nonempty string value.`,
  });
  return undefined;
}

export function requiredText(
  collector: ModelCollector,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  if (typeof value === "string") return value;
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: "This declaration member must be a string.",
    expected: "a string",
    received: value === undefined ? "absent" : describeReceived(value),
    repair: `Give ${String(path.at(-1))} a string value.`,
  });
  return undefined;
}

export function optionalString(
  collector: ModelCollector,
  value: unknown,
  path: DefinitionPath,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path,
    message: "This declaration member must be a string, null, or absent.",
    expected: "a string, null, or absent",
    received: describeReceived(value),
    repair: `Pass a string, pass null, or omit ${String(path.at(-1))}.`,
  });
  return undefined;
}

export function normalizeExamples(
  collector: ModelCollector,
  value: unknown,
  path: DefinitionPath,
): readonly DefinitionExampleDeclaration[] {
  if (value === undefined) return [];
  const entries = takeArray(collector, value, path);
  if (entries === undefined) return [];
  return entries.flatMap((entry, index) => {
    const examplePath = [...path, index];
    const example = take(
      collector,
      snapshotDataRecord(entry, ["key", "value"], examplePath),
      ["key", "value"],
    );
    if (example === undefined) return [];
    const key = requiredString(collector, example.key, [...examplePath, "key"]);
    if (typeof example.value !== "string") {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...examplePath, "value"],
        message: "An example value must be the stored JSON string.",
        expected: "string",
        received: describeReceived(example.value),
        repair: 'Pass the serialized example, such as \'{"id":"item-1"}\'.',
      });
      return [];
    }
    return key === undefined ? [] : [{ key, value: example.value }];
  });
}
