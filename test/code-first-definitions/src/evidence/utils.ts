import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JsonValue } from "@powerhousedao/shared/document-model";
import {
  canonicalJson,
  compareCodeUnits,
  sha256,
  toPosixPath,
} from "document-model/tooling";

export {
  canonicalJson,
  compareCodeUnits,
  sha256,
  toPosixPath as normalizePath,
} from "document-model/tooling";

export function digestJson(value: unknown): `sha256:${string}` {
  return sha256(canonicalJson(value));
}

export function cloneJsonValue(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

export function equalJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/** `Array.isArray` widens a union containing `readonly T[]` to `any[]`, so
 * narrow with an explicit guard instead. */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function firstJsonDifference(
  left: JsonValue,
  right: JsonValue,
  path: string,
): string | null {
  if (Object.is(left, right)) return null;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return `${path}: ${canonicalJson(left)} !== ${canonicalJson(right)}`;
  }
  if (isJsonArray(left) || isJsonArray(right)) {
    if (!isJsonArray(left) || !isJsonArray(right)) return `${path}: shape`;
    if (left.length !== right.length) {
      return `${path}.length: ${left.length} !== ${right.length}`;
    }
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstJsonDifference(
        left[index]!,
        right[index]!,
        `${path}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }

  const leftRecord = left as Readonly<Record<string, JsonValue>>;
  const rightRecord = right as Readonly<Record<string, JsonValue>>;
  const keys = [
    ...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]),
  ].sort(compareCodeUnits);
  for (const key of keys) {
    const difference = firstJsonDifference(
      leftRecord[key] as JsonValue,
      rightRecord[key] as JsonValue,
      `${path}.${key}`,
    );
    if (difference) return difference;
  }
  return null;
}

export function firstDifference(
  left: unknown,
  right: unknown,
  path = "$",
): string | null {
  return firstJsonDifference(cloneJsonValue(left), cloneJsonValue(right), path);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function filesBelow(path: string): Promise<string[]> {
  const metadata = await stat(path);
  if (metadata.isFile()) return [path];
  const files: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort((left, right) =>
    compareCodeUnits(toPosixPath(left), toPosixPath(right)),
  );
}
