// The host.js files an export stands for. Browser-safe; materialize writes these.
import type { HostExport } from "@powerhousedao/host-core/schema";
import { fileOf } from "../host-rules/members.ts";
import type { Setter } from "../host-rules/schema.ts";

export type HostFile = { folder: string; path: string; content: string };

function hostFile(folder: string, body: unknown): HostFile {
  return {
    folder,
    path: `hosts/${folder}/host.js`,
    content: `export default ${JSON.stringify(body, null, 2)};\n`,
  };
}

/** The host's own file first, then one per member folder. */
export function hostFiles(envelope: HostExport): HostFile[] {
  return [
    hostFile(envelope.name, envelope.host),
    ...Object.entries(envelope.members).map(([folder, body]) =>
      hostFile(folder, body),
    ),
  ];
}

/** The files these setters write to, in `hostFiles` order. */
export function changedFiles(
  envelope: HostExport,
  setters: readonly Setter[],
): HostFile[] {
  const touched = new Set(
    setters.flatMap((setter) => fileOf(envelope, setter.path) ?? []),
  );
  return hostFiles(envelope).filter((file) => touched.has(file.path));
}
