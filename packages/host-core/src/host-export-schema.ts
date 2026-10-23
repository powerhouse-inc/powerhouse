import { z } from "zod";
import { declaredHostSchemas } from "./host-schemas.js";

const declaredHostSchema = z.union([
  declaredHostSchemas.reactorHostSchema,
  declaredHostSchemas.compoundHostSchema,
]);

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
    if (!("children" in value.host) && Object.keys(value.members).length) {
      ctx.addIssue({
        code: "custom",
        path: ["members"],
        message: "A reactor host has no members.",
      });
    }
    const hosts = [
      { at: ["host"], host: value.host },
      ...Object.entries(value.members).map(([folder, host]) => ({
        at: ["members", folder],
        host,
      })),
    ];
    for (const { at, host } of hosts) {
      if (!("children" in host)) continue;
      for (const [key, child] of Object.entries(host.children)) {
        if (child.host in value.members) continue;
        ctx.addIssue({
          code: "custom",
          path: [...at, "children", key, "host"],
          message: `Member folder "${child.host}" is missing from members.`,
        });
      }
    }
  });

export type HostExport = z.input<typeof hostExportSchema>;
