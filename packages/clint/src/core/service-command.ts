import path from "node:path";
import { z } from "zod";
import type {
  Command,
  CommandContext,
  ServiceDefinition,
  ServiceInstanceStatus,
} from "./types.js";
import { getSchemaFields } from "./schema.js";
import { resolveServiceName } from "./services.js";

/**
 * Format a service instance status line for display.
 */
export function formatStatus(s: ServiceInstanceStatus): string {
  const icon =
    s.status === "ready"
      ? "●"
      : s.status === "starting"
        ? "◐"
        : s.status === "failed"
          ? "✗"
          : s.status === "stopping"
            ? "◑"
            : s.status === "stopped"
              ? "■"
              : "○";
  const parts = [`${icon} ${s.name} [${s.status}]`];
  if (s.instanceId && s.instanceId !== s.serviceId)
    parts.push(`(${s.instanceId})`);
  if (s.workdir) parts.push(path.basename(s.workdir));
  if (s.pid) parts.push(`pid ${s.pid}`);
  if (s.endpoints) {
    const ep = Object.entries(s.endpoints).map(([k, v]) => `${k}=${v}`);
    if (ep.length) parts.push(ep.join(" "));
  }
  if (s.workdir) parts.push(s.workdir);
  if (s.error) parts.push(`error: ${s.error}`);
  if (s.restartAttempt) parts.push(`restart #${s.restartAttempt}`);
  return parts.join("  ");
}

/**
 * Create per-service commands for a service definition.
 *
 * For service `id: 'vetra'`, generates:
 * - vetra-start: Start the service
 * - vetra-stop: Stop the service
 * - vetra-restart: Restart the service
 * - vetra-ps: Show service status
 * - vetra-logs: Tail service logs
 * - vetra-manage: Open interactive panel (REPL only)
 */
export function createServiceCommands(def: ServiceDefinition<any>): Command[] {
  const { id } = def;
  const maxInstances = def.maxInstances ?? 1;
  const isMultiInstance = maxInstances > 1;

  // Build the start input schema by merging paramsSchema fields
  const startFields: Record<string, z.ZodTypeAny> = {};
  if (isMultiInstance) {
    startFields.name = z
      .string()
      .optional()
      .describe("Instance name (for multi-instance services)");
  }
  startFields.workdir = z
    .string()
    .optional()
    .describe("Working directory for the service");

  // Merge paramsSchema fields into start command
  if (def.paramsSchema) {
    const paramFields = getSchemaFields(def.paramsSchema);
    for (const field of paramFields) {
      // Get the actual Zod field from the params schema shape
      if (def.paramsSchema instanceof z.ZodObject) {
        const shape = (def.paramsSchema as z.ZodObject<any>).shape;
        if (shape[field.key]) {
          startFields[field.key] = shape[field.key];
        }
      }
    }
  }

  const startSchema = z.object(startFields);

  // Instance flag for multi-instance commands
  const instanceFields: Record<string, z.ZodTypeAny> = {};
  if (isMultiInstance) {
    instanceFields.instance = z
      .string()
      .optional()
      .describe("Instance ID (omit for all)");
  }

  const commands: Command[] = [];

  // ── start ──
  commands.push({
    id: `${id}-start`,
    description: `Start ${resolveServiceName(def)}`,
    inputSchema: startSchema,
    execute: async (rawInput, context: CommandContext) => {
      const input = rawInput as Record<string, unknown>;
      const services = context.services;
      if (!services) throw new Error("No services configured");
      try {
        const params: Record<string, unknown> = {};
        // Extract paramsSchema fields from input
        if (def.paramsSchema) {
          const paramFields = getSchemaFields(def.paramsSchema);
          for (const field of paramFields) {
            if (input[field.key] !== undefined) {
              params[field.key] = input[field.key];
            }
          }
        }
        // Resolve explicit --workdir relative to CLI workdir (for instance identity).
        // Always spawn in context.workdir (or resolved workdir if explicit).
        const rawWorkdir = input.workdir as string | undefined;
        const resolvedWorkdir = rawWorkdir
          ? path.resolve(context.workdir, rawWorkdir)
          : undefined;
        const cwd = resolvedWorkdir ?? context.workdir;
        const instanceId = await services.start(id, {
          name: input.name as string | undefined,
          workdir: cwd,
          cwd,
          params: Object.keys(params).length > 0 ? params : undefined,
        });
        const status = services
          .list(id)
          .find((s) => s.instanceId === instanceId);
        return { text: formatStatus(status!) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `✗ ${id}: ${msg}` };
      }
    },
  });

  // ── stop ──
  commands.push({
    id: `${id}-stop`,
    description: `Stop ${resolveServiceName(def)}`,
    inputSchema: z.object(instanceFields),
    execute: async (rawInput, context: CommandContext) => {
      const input = rawInput as Record<string, unknown>;
      const services = context.services;
      if (!services) throw new Error("No services configured");
      try {
        await services.stop(id, input.instance as string | undefined);
        return { text: "" };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `✗ ${id}: ${msg}` };
      }
    },
  });

  // ── restart ──
  commands.push({
    id: `${id}-restart`,
    description: `Restart ${resolveServiceName(def)}`,
    inputSchema: z.object(instanceFields),
    execute: async (rawInput, context: CommandContext) => {
      const input = rawInput as Record<string, unknown>;
      const services = context.services;
      if (!services) throw new Error("No services configured");
      try {
        // Stop if running, capturing its workdir/params for the restart
        const statuses = services.list(id);
        const running = statuses.filter(
          (s) => s.status === "ready" || s.status === "starting",
        );

        let prevWorkdir: string | undefined;
        let prevParams: Record<string, unknown> | undefined;
        let prevName: string | undefined;

        if (running.length > 0) {
          const instance = running[0]!;
          prevWorkdir = instance.workdir;
          prevParams = instance.params;
          if (instance.instanceId?.includes(":")) {
            prevName = instance.instanceId.split(":")[1];
          }
          await services.stop(id, input.instance as string | undefined);
        }

        const cwd = prevWorkdir ?? context.workdir;
        const instanceId = await services.start(id, {
          workdir: cwd,
          cwd,
          params: prevParams,
          name: prevName,
        });
        const status = services
          .list(id)
          .find((s) => s.instanceId === instanceId);
        return { text: formatStatus(status!) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { text: `✗ ${id}: ${msg}` };
      }
    },
  });

  // ── ps ──
  commands.push({
    id: `${id}-ps`,
    description: `Show ${resolveServiceName(def)} status`,
    inputSchema: z.object({}),
    execute: async (_input, context: CommandContext) => {
      const services = context.services;
      if (!services) throw new Error("No services configured");
      const all = services.list(id);
      if (all.length === 0) return { text: `No instances of ${id}` };
      return { text: all.map(formatStatus).join("\n"), data: all };
    },
  });

  // ── logs ──
  const logsFields: Record<string, z.ZodTypeAny> = {
    lines: z.coerce
      .number()
      .default(50)
      .describe("Number of log lines to show"),
    instance: z
      .string()
      .optional()
      .describe("Instance ID (use -ps to find it)"),
  };

  commands.push({
    id: `${id}-logs`,
    description: `Show ${resolveServiceName(def)} logs`,
    inputSchema: z.object(logsFields),
    execute: async (rawInput, context: CommandContext) => {
      const input = rawInput as Record<string, unknown>;
      const services = context.services;
      if (!services) throw new Error("No services configured");
      return {
        text:
          services.logs(
            id,
            input.instance as string | undefined,
            input.lines as number,
          ) || "No logs available",
      };
    },
  });

  // ── manage ──
  commands.push({
    id: `${id}-manage`,
    description: `Open ${resolveServiceName(def)} management panel (REPL only)`,
    inputSchema: z.object({}),
    execute: async (_input, context: CommandContext) => {
      // This is intercepted by the session before execute() runs
      // Fallback for command mode
      const services = context.services;
      if (!services) throw new Error("No services configured");
      const all = services.list(id);
      return { text: all.map(formatStatus).join("\n") };
    },
  });

  // ── ls (project scanner) ──
  if (def.projectScanner) {
    commands.push({
      id: `${id}-ls`,
      description: `List ${resolveServiceName(def)} projects in the working directory`,
      inputSchema: z.object({}),
      execute: async (_input, context: CommandContext) => {
        const services = context.services;
        if (!services) throw new Error("No services configured");
        const projects = services.scanProjects(id, context.workdir);
        if (projects.length === 0) {
          return {
            text: `No ${resolveServiceName(def)} projects found`,
            data: [],
          };
        }

        const hasDocLinks = projects.some((p) => p.documentId);

        if (hasDocLinks) {
          const header =
            "  Name                Location              Document ID                          Type";
          const sep = "  " + "-".repeat(header.length - 2);
          const lines = projects.map((p) => {
            const rel = path.relative(context.workdir, p.path);
            const display = rel ? "./" + rel : ".";
            const docId = p.documentId ? p.documentId.slice(0, 36) : "(none)";
            const docType = p.documentType ?? "-";
            return `  ${p.name.padEnd(20)}${display.padEnd(22)}${docId.padEnd(37)}${docType}`;
          });
          return {
            text: `Found ${projects.length} project(s):\n${header}\n${sep}\n${lines.join("\n")}`,
            data: projects,
          };
        } else {
          const lines = projects.map((p) => {
            const rel = path.relative(context.workdir, p.path);
            const display = rel ? "./" + rel : ".";
            return `  ${p.name}  ${display}`;
          });
          return {
            text: `Found ${projects.length} project(s):\n${lines.join("\n")}`,
            data: projects,
          };
        }
      },
    });
  }

  return commands;
}
