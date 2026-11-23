import {
  callControl,
  ControlError,
  type ControlChannel,
  type ControlRecord,
} from "@powerhousedao/host-core/control-channel";
import { z } from "zod";
import type {
  ServiceInstanceStatus,
  ServiceManager,
  ServiceStartOptions,
} from "./types.js";

/**
 * A CLI's services over the control channel of the process that runs them.
 * The process that keeps running answers `list`, `start`, `stop`, `restart`
 * and `logs` ({@link serveServices}); a command typed in a second terminal
 * reaches them through a manager that forwards ({@link connectRemoteServices}).
 * A command with nothing to forward to cannot start a service at all
 * ({@link refuseServiceStarts}): the service would end with the command.
 */

const startParamsSchema = z.object({
  id: z.string().min(1),
  options: z
    .object({
      workdir: z.string().optional(),
      cwd: z.string().optional(),
      params: z.record(z.string(), z.unknown()).optional(),
      name: z.string().optional(),
      lifetime: z.enum(["caller", "supervisor"]).optional(),
    })
    .optional(),
});
const instanceParamsSchema = z.object({
  id: z.string().min(1),
  instanceId: z.string().optional(),
});
const listParamsSchema = z.object({ serviceId: z.string().optional() });
const logsParamsSchema = instanceParamsSchema.extend({
  lines: z.number().int().positive().optional(),
});

function parse<T>(schema: z.ZodType<T>, params: unknown): T {
  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) {
    throw new Error(
      `Bad parameters: ${parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

/**
 * Stops the service's running instance, if any, and starts it again where
 * and as it ran. Resolves with the new instance's id.
 */
export async function restartService(
  services: ServiceManager,
  id: string,
  instanceId: string | undefined,
  workdir: string,
): Promise<string> {
  const running = services
    .list(id)
    .filter((s) => s.status === "ready" || s.status === "starting");
  const [instance] = running;
  let name: string | undefined;
  if (instance) {
    if (instance.instanceId?.includes(":")) {
      name = instance.instanceId.split(":")[1];
    }
    await services.stop(id, instanceId);
  }
  const cwd = instance?.workdir ?? workdir;
  return services.start(id, {
    workdir: cwd,
    cwd,
    params: instance?.params,
    name,
    ...(instance?.supervisor ? { lifetime: instance.supervisor.lifetime } : {}),
  });
}

/** Answers service requests on `channel` from `services`. */
export function serveServices(
  channel: ControlChannel,
  services: ServiceManager,
  cli: { name: string; version: string; workdir: string },
): void {
  channel.describe({ cli: cli.name, version: cli.version });
  channel.handle("list", (params) => ({
    instances: services.list(parse(listParamsSchema, params).serviceId),
  }));
  channel.handle("start", async (params) => {
    const { id, options } = parse(startParamsSchema, params);
    const instanceId = await services.start(id, options);
    return { instanceId, instances: services.list() };
  });
  channel.handle("stop", async (params) => {
    const { id, instanceId } = parse(instanceParamsSchema, params);
    await services.stop(id, instanceId);
    return { instances: services.list() };
  });
  channel.handle("restart", async (params) => {
    const { id, instanceId } = parse(instanceParamsSchema, params);
    const started = await restartService(services, id, instanceId, cli.workdir);
    return { instanceId: started, instances: services.list() };
  });
  channel.handle("logs", (params) => {
    const { id, instanceId, lines } = parse(logsParamsSchema, params);
    return { text: services.logs(id, instanceId, lines) };
  });
}

const instancesOf = (result: unknown): ServiceInstanceStatus[] =>
  (result as { instances?: ServiceInstanceStatus[] } | null)?.instances ?? [];

/**
 * A manager whose instances live in the process behind `control`: start,
 * stop and list act there; logs, definitions and scans are read here (the
 * files are the same). Undefined when that process does not answer service
 * requests.
 */
export async function connectRemoteServices(
  local: ServiceManager,
  control: ControlRecord,
): Promise<ServiceManager | undefined> {
  let instances: ServiceInstanceStatus[];
  try {
    const hello = (await callControl(control, "hello", undefined, {
      timeoutMs: 5_000,
    })) as { methods?: unknown };
    const methods = Array.isArray(hello?.methods) ? hello.methods : [];
    if (!["list", "start", "stop"].every((m) => methods.includes(m))) {
      return undefined;
    }
    instances = instancesOf(await callControl(control, "list"));
  } catch (error) {
    if (error instanceof ControlError) return undefined;
    throw error;
  }

  return {
    ...local,
    async start(id: string, opts?: ServiceStartOptions): Promise<string> {
      const result = (await callControl(control, "start", {
        id,
        ...(opts ? { options: opts } : {}),
      })) as { instanceId: string };
      instances = instancesOf(result);
      return result.instanceId;
    },
    async stop(id: string, instanceId?: string): Promise<void> {
      instances = instancesOf(
        await callControl(control, "stop", {
          id,
          ...(instanceId ? { instanceId } : {}),
        }),
      );
    },
    // The instances are the other process's to stop.
    stopAll: () => local.stopAll(),
    list: (serviceId?: string) =>
      serviceId
        ? instances.filter((s) => s.serviceId === serviceId)
        : [...instances],
  };
}

/** Thrown by a start that cannot outlive its command. */
export class ServiceStartRefused extends Error {
  constructor(
    id: string,
    serveCommand: string | undefined,
    supervisor?: { pid: number },
  ) {
    super(
      `${id} was not started: a service runs as long as the process that started it, and this command ends. ` +
        `Start it where it keeps running: ${serveCommand ? `\`${serveCommand}\`` : "`ph run <host>`"}, then run this command from a second terminal.` +
        (supervisor
          ? ` Or pass \`--lifetime supervisor\`: the supervisor (pid ${supervisor.pid}) then keeps it running.`
          : ""),
    );
    this.name = "ServiceStartRefused";
  }
}

/**
 * The manager of a command that ends with nothing running to forward to:
 * everything but `start`, which is refused with where to run instead. A
 * start that lives with the user's supervisor outlives the command, and is
 * the local manager's to pass on.
 */
export function refuseServiceStarts(
  local: ServiceManager,
  serveCommand: string | undefined,
): ServiceManager {
  return {
    ...local,
    start: async (id: string, opts?: ServiceStartOptions) => {
      if (opts?.lifetime === "supervisor") return local.start(id, opts);
      throw new ServiceStartRefused(
        id,
        serveCommand,
        await local.supervisor?.(),
      );
    },
  };
}
