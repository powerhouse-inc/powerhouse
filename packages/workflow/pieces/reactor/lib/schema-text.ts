// Pure helpers over what the reactor reports: a drive's folders, and the SDL
// an action's input needs to be read on its own.

interface DriveNode {
  id: string;
  name?: string;
  kind?: string;
  parentFolder?: string | null;
}

export interface FolderOption {
  label: string;
  value: string;
}

function driveNodes(state: unknown): DriveNode[] {
  const nodes = (state as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(
    (node): node is DriveNode =>
      typeof node === "object" &&
      node !== null &&
      typeof (node as DriveNode).id === "string",
  );
}

// Every folder in a drive, labelled by its path so two "2026" folders under
// different parents stay apart.
export function folderOptions(driveState: unknown): FolderOption[] {
  const folders = driveNodes(driveState).filter(
    (node) => node.kind === "folder",
  );
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const pathOf = (folder: DriveNode): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: DriveNode | undefined = folder;
    // A cycle in corrupt state must not hang the options call.
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name || "(unnamed)");
      current = current.parentFolder
        ? byId.get(current.parentFolder)
        : undefined;
    }
    return names.join(" / ");
  };
  return folders
    .map((folder) => ({ label: pathOf(folder), value: folder.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const DEFINITION = /\b(?:input|enum|type)\s+(\w+)/g;
const SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function blockOf(sdl: string, keyword: string, name: string): string | null {
  return (
    new RegExp(`${keyword}\\s+${name}\\s*\\{[^}]*\\}`).exec(sdl)?.[0] ?? null
  );
}

// An operation's SDL defines its input types but not the enums they use, which
// live in the state schema; this appends the referenced ones.
export function withReferencedEnums(
  inputSchema: string,
  stateSchema: string | null | undefined,
): string {
  if (!stateSchema) return inputSchema;
  const defined = new Set(
    [...inputSchema.matchAll(DEFINITION)].map((match) => match[1]),
  );
  const referenced = new Set(
    [...inputSchema.matchAll(/:\s*\[?\s*(\w+)/g)]
      .map((match) => match[1])
      .filter((name) => !defined.has(name) && !SCALARS.has(name)),
  );
  const enums = [...referenced]
    .map((name) => blockOf(stateSchema, "enum", name))
    .filter((block): block is string => block !== null);
  return enums.length ? `${inputSchema}\n\n${enums.join("\n\n")}` : inputSchema;
}
