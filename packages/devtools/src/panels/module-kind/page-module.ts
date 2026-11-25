import type { ProjectProcessor } from "../../api.js";
import type { ProjectModule } from "../../project/kinds.js";
import { plural } from "../../lib/plural.js";

/** A module the page shows: every kind but the document model, which has a
 * page of its own. */
export type PageModule = Exclude<ProjectModule, { kind: "document-model" }>;

export type ModulePageKind = PageModule["kind"];

export const PROCESSOR_TYPE: Record<
  NonNullable<ProjectProcessor["type"]>,
  string
> = {
  analytics: "analytics",
  relationalDb: "relational database",
};

export const APP: Record<ProjectProcessor["apps"][number], string> = {
  connect: "Connect",
  switchboard: "Switchboard",
};

export const endpointOf = (subgraph: string) => `/graphql/${subgraph}`;

/** What a list row says below the module's name. Empty when the code does
 * not say. */
export function subline(entry: PageModule): string {
  switch (entry.kind) {
    case "editor":
      return entry.module.documentTypes.join(", ");
    case "app": {
      const { documentTypes, allowedDocumentTypes } = entry.module;
      if (documentTypes.length > 0) return `opens ${documentTypes.join(", ")}`;
      if (allowedDocumentTypes === null) return "";
      return allowedDocumentTypes.length === 0
        ? "every type"
        : plural(allowedDocumentTypes.length, "allowed type");
    }
    case "subgraph":
      return endpointOf(entry.module.name);
    case "processor": {
      const { type, apps } = entry.module;
      return [
        type && PROCESSOR_TYPE[type],
        apps.map((app) => APP[app]).join(", "),
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

/** A file's path as its module shows it: relative to the module's folder. */
export const belowFolder = (file: string, folder: string) =>
  file.startsWith(`${folder}/`) ? file.slice(folder.length + 1) : file;
