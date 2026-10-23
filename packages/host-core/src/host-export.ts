import path from "node:path";
import { z } from "zod";
import { hostExportSchema, type HostExport } from "./host-export-schema.js";
import { declaredHostSchemas, type HostDefinition } from "./host-schemas.js";
import { HostLoadError, loadHost } from "./host-loader.js";
import { readProjectName } from "./run-record.js";

function checkHint(name: string): string {
  return `Run \`ph host check ${name}\`.`;
}

function childFolders(host: HostDefinition, name: string): string[] {
  if (!("children" in host)) return [];
  const parsed = declaredHostSchemas.childrenSchema.safeParse(host.children);
  if (!parsed.success) {
    throw new HostLoadError(
      `hosts/${name}/host.js: invalid \`children\`:\n${z.prettifyError(parsed.error)}`,
      checkHint(name),
    );
  }
  return Object.values(parsed.data).map((child) => child.host);
}

/** A host as declared and every member it reaches, raw `loadHost` bodies. */
export async function exportHost(
  projectRoot: string,
  name: string,
): Promise<HostExport> {
  const root = path.resolve(projectRoot);
  const { host } = await loadHost(root, name);
  const members: Record<string, HostDefinition> = {};
  const visit = async (folders: string[]): Promise<void> => {
    for (const folder of folders) {
      if (folder in members) continue;
      const member = (await loadHost(root, folder)).host;
      members[folder] = member;
      await visit(childFolders(member, folder));
    }
  };
  await visit(childFolders(host, name));
  const envelope: HostExport = {
    format: "ph-host-export",
    version: 1,
    project: { name: readProjectName(root), root },
    name,
    host,
    members,
  };
  // What a consumer parses: `undefined` keys drop in the JSON round trip.
  const parsed = hostExportSchema.safeParse(
    JSON.parse(JSON.stringify(envelope)),
  );
  if (!parsed.success) {
    throw new HostLoadError(
      `hosts/${name}/host.js: the export is not a valid host export:\n${z.prettifyError(parsed.error)}`,
      checkHint(name),
    );
  }
  return envelope;
}
