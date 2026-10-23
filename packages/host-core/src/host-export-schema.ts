import { z } from "zod";
import { declaredHostSchemas, type HostDefinition } from "./host-schemas.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childFolders(host: unknown): [key: string, folder: string][] {
  if (!isRecord(host) || !isRecord(host.children)) return [];
  return Object.entries(host.children).flatMap(([key, child]) =>
    isRecord(child) && typeof child.host === "string"
      ? [[key, child.host] as [string, string]]
      : [],
  );
}

// Picked by structure, as the loader does, so issues name the field.
const declaredHostSchema = z
  .custom<HostDefinition>()
  .superRefine((host, ctx) => {
    const schema =
      isRecord(host) && "children" in host
        ? declaredHostSchemas.compoundHostSchema
        : declaredHostSchemas.reactorHostSchema;
    const result = schema.safeParse(host);
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
      });
    }
  });

/** `ph host export`: a declared host plus its members, keyed by folder. */
export const hostExportSchema = z
  .strictObject({
    format: z.literal("ph-host-export"),
    version: z.literal(1),
    project: z.strictObject({
      name: z.string().min(1),
      root: z.string().min(1),
    }),
    name: z.string().min(1),
    host: declaredHostSchema,
    members: z.record(z.string(), declaredHostSchema),
  })
  .superRefine((value, ctx) => {
    const reached = new Set<string>();
    const pending: [at: string[], host: unknown][] = [[["host"], value.host]];
    for (let next = pending.shift(); next; next = pending.shift()) {
      const [at, host] = next;
      for (const [key, folder] of childFolders(host)) {
        if (!(folder in value.members)) {
          ctx.addIssue({
            code: "custom",
            path: [...at, "children", key, "host"],
            message: `Member folder "${folder}" is missing from members.`,
          });
          continue;
        }
        if (reached.has(folder)) continue;
        reached.add(folder);
        pending.push([["members", folder], value.members[folder]]);
      }
    }
    for (const folder of Object.keys(value.members)) {
      if (reached.has(folder)) continue;
      ctx.addIssue({
        code: "custom",
        path: ["members", folder],
        message: `Member "${folder}" is not reached from the host's children.`,
      });
    }
  });

export type HostExport = z.input<typeof hostExportSchema>;
