import type {
  ProjectCheck,
  ProjectDiagnostic,
  ProjectModuleKind,
} from "../../project-types.js";
import type { Barrel } from "./barrels.js";
import { readText } from "./project-fs.js";
import { MANIFEST_FILE } from "./revision.js";

const MANIFEST_SECTION = {
  "document-model": "documentModels",
  editor: "editors",
  app: "apps",
  subgraph: "subgraphs",
  processor: "processors",
} as const satisfies Record<ProjectModuleKind, string>;

type ManifestEntry = { id: string; name: string };

export type ProjectManifest =
  | { state: "missing" | "invalid" }
  | { state: "read"; entries: (kind: ProjectModuleKind) => ManifestEntry[] };

/** Reads `powerhouse.manifest.json` as plain JSON. Entries without a string id are dropped. */
export function readManifest(root: string): ProjectManifest {
  const text = readText(root, MANIFEST_FILE);
  if (text === undefined) return { state: "missing" };
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    return { state: "invalid" };
  }
  if (typeof manifest !== "object" || manifest === null) {
    return { state: "invalid" };
  }
  const sections = manifest as Record<string, unknown>;
  return {
    state: "read",
    entries: (kind) => {
      const section = sections[MANIFEST_SECTION[kind]];
      return (Array.isArray(section) ? section : []).flatMap(
        (entry: { id?: unknown; name?: unknown } | null) =>
          typeof entry?.id === "string"
            ? [
                {
                  id: entry.id,
                  name: typeof entry.name === "string" ? entry.name : "",
                },
              ]
            : [],
      );
    },
  };
}

const GENERATE = {
  "document-model": "ph generate document-model --all",
  editor: "ph generate editor --all",
  app: "ph generate app --all",
  subgraph: "ph generate subgraph --all",
  processor: "ph generate processor --all",
} as const satisfies Record<ProjectModuleKind, string>;

const NOUN = {
  "document-model": "document model",
  editor: "editor",
  app: "app",
  subgraph: "subgraph",
  processor: "processor",
} as const satisfies Record<ProjectModuleKind, string>;

const list = (items: string[], last: "and" | "or") =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;

/** Whether one of the barrels the host reads names the module's folder. */
export function registeredCheck(
  kind: ProjectModuleKind,
  folder: string,
  barrels: Barrel[],
): ProjectCheck {
  const registering = barrels.filter((barrel) => barrel.references(folder));
  if (registering.length > 0) {
    return {
      id: "registered",
      state: "pass",
      label: `Registered in ${list(
        registering.map(({ path }) => path),
        "and",
      )}`,
    };
  }
  return {
    id: "registered",
    state: "warn",
    label: `Not registered in ${list(
      barrels.map(({ path }) => path),
      "or",
    )}`,
    detail: `The host does not load this ${NOUN[kind]}. Run \`${GENERATE[kind]}\` to register it.`,
  };
}

/**
 * Whether the manifest lists the module. `name` is compared only when the
 * code declares a display name, which a processor and a subgraph do not.
 */
export function manifestCheck(
  manifest: ProjectManifest,
  kind: ProjectModuleKind,
  module: { id: string; name?: string },
): ProjectCheck {
  const warn = (label: string, detail: string): ProjectCheck => ({
    id: "manifest",
    state: "warn",
    label,
    detail,
  });
  if (manifest.state === "invalid") {
    return warn(
      `${MANIFEST_FILE} is not a JSON object`,
      `Repair the JSON in ${MANIFEST_FILE}.`,
    );
  }
  const entries = manifest.state === "read" ? manifest.entries(kind) : [];
  const listed = entries.find(({ id }) => id === module.id);
  if (listed === undefined) {
    const renamed = entries.find(
      ({ name }) => module.name !== undefined && name === module.name,
    );
    return renamed === undefined
      ? warn(
          `Not listed in ${MANIFEST_FILE}`,
          `Run \`${GENERATE[kind]}\` to add it.`,
        )
      : warn(
          `Listed in ${MANIFEST_FILE} with the id ${renamed.id}`,
          `Change the entry's id to ${module.id} in ${MANIFEST_FILE}.`,
        );
  }
  if (module.name !== undefined && listed.name !== module.name) {
    return warn(
      `Listed in ${MANIFEST_FILE} as ${listed.name}`,
      `Change the entry's name to ${module.name} in ${MANIFEST_FILE}. \`ph generate\` does not rename an entry it already wrote.`,
    );
  }
  return { id: "manifest", state: "pass", label: `Listed in ${MANIFEST_FILE}` };
}

/**
 * Whether each document type the module names is a model of this project or
 * one of Powerhouse's own. `*` matches every type.
 */
export function documentTypesCheck(
  documentTypes: string[],
  projectTypes: ReadonlySet<string>,
): ProjectCheck {
  const unknown = documentTypes.filter(
    (type) =>
      type !== "*" &&
      !type.startsWith("powerhouse/") &&
      !projectTypes.has(type),
  );
  if (unknown.length === 0) {
    return {
      id: "document-types",
      state: "pass",
      label: "Document types are models of this project or Powerhouse's own",
    };
  }
  return {
    id: "document-types",
    state: "warn",
    label: `No model of type ${list(unknown, "or")} in the project`,
    detail: "Fine if an installed package provides it.",
  };
}

/** Fails with the model's first error from the document model checks. */
export function definitionCheck(errors: ProjectDiagnostic[]): ProjectCheck {
  if (errors.length === 0) {
    return {
      id: "definition",
      state: "pass",
      label: "Definition passes the document model checks",
    };
  }
  const [first] = errors;
  return {
    id: "definition",
    state: "fail",
    label:
      errors.length === 1
        ? "Definition has 1 error"
        : `Definition has ${errors.length} errors`,
    detail: [first.message, first.repair].filter(Boolean).join(" "),
  };
}
