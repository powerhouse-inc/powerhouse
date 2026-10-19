import type {
  EventBus,
  Routine,
  RoutineConfig,
  ServiceDefinition,
  ServiceInstanceStatus,
  ServiceManager,
  ServiceStartOptions,
  StreamChunk,
} from "./types.js";
import { scanProjects as scanProjectsImpl } from "./project-scanner.js";
import { slugToTitle } from "./schema.js";

const DEFAULT_LOG_BUFFER_SIZE = 500;

/**
 * Create a ServiceManager adapter that wraps a Routine,
 * giving it the same command surface as a process-based service.
 */
export function createRoutineServiceAdapter(
  routine: Routine,
  config: RoutineConfig,
  eventBus?: EventBus,
): ServiceManager {
  const id = config.id!;
  const name = config.name ?? slugToTitle(id);
  const logBuffer: string[] = [];
  let instanceWorkdir: string | undefined;

  // Wire up log capture
  const originalOnOutput = routine.onOutput;
  routine.onOutput = (text: string) => {
    logBuffer.push(text);
    while (logBuffer.length > DEFAULT_LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }
    originalOnOutput?.(text);
  };

  // Map routine status to service status
  function mapStatus(): ServiceInstanceStatus["status"] {
    switch (routine.status) {
      case "init":
      case "ready":
        return "idle";
      case "running":
        return "ready";
      case "stopping":
        return "stopping";
    }
  }

  function getInstanceStatus(): ServiceInstanceStatus {
    return {
      serviceId: id,
      instanceId: id,
      name,
      status: mapStatus(),
      ...(instanceWorkdir && { workdir: instanceWorkdir }),
    };
  }

  const syntheticDef: ServiceDefinition = {
    id,
    name,
    command: "", // in-process, no shell command
    maxInstances: 1,
    ...(config.projectScanner && { projectScanner: config.projectScanner }),
  };

  async function start(
    _id: string,
    opts?: ServiceStartOptions,
  ): Promise<string> {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    if (routine.status === "running") {
      throw new Error(`Service ${id} is already running`);
    }
    if (opts?.workdir) {
      instanceWorkdir = opts.workdir;
    }
    routine.start();
    eventBus?.emit("service:ready", { id, instanceId: id, name });
    return id;
  }

  async function stop(_id: string): Promise<void> {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    if (routine.status !== "running") {
      throw new Error(`Service ${id} is not running`);
    }
    await routine.stop();
    eventBus?.emit("service:stopped", { id, instanceId: id, name });
  }

  function list(serviceId?: string): ServiceInstanceStatus[] {
    if (serviceId && serviceId !== id) return [];
    return [getInstanceStatus()];
  }

  function getDefinition(_id: string): ServiceDefinition | undefined {
    return _id === id ? syntheticDef : undefined;
  }

  function logs(_id: string, _instanceId?: string, lines = 50): string {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    return logBuffer.slice(-lines).join("\n");
  }

  function watchLogs(
    _id: string,
    _instanceId: string,
    onLine: (line: string) => void,
  ): () => void {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    const prevOnOutput = routine.onOutput;
    routine.onOutput = (text: string) => {
      prevOnOutput?.(text);
      onLine(text);
    };
    return () => {
      routine.onOutput = prevOnOutput ?? undefined;
    };
  }

  function watchChunks(
    _id: string,
    _instanceId: string,
    onChunk: (chunk: StreamChunk) => void,
  ): () => void {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    const prevOnChunk = routine.onChunk;
    routine.onChunk = (chunk: StreamChunk) => {
      prevOnChunk?.(chunk);
      onChunk(chunk);
    };
    return () => {
      routine.onChunk = prevOnChunk ?? undefined;
    };
  }

  function scanProjects(_id: string, rootDir: string) {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    if (!config.projectScanner) return [];
    return scanProjectsImpl(rootDir, config.projectScanner);
  }

  function purgeStoppedInstances(_id: string): void {
    if (_id !== id) throw new Error(`Unknown service: ${_id}`);
    logBuffer.length = 0;
  }

  return {
    start,
    stop,
    list,
    getDefinition,
    logs,
    watchLogs,
    watchChunks,
    scanProjects,
    purgeStoppedInstances,
  };
}

/**
 * Create a composite ServiceManager that routes calls to the correct
 * underlying manager based on service ID.
 */
export function createCompositeServiceManager(
  managers: ServiceManager[],
  routeMap: Map<string, ServiceManager>,
): ServiceManager {
  function getManager(id: string): ServiceManager {
    const mgr = routeMap.get(id);
    if (!mgr) throw new Error(`Unknown service: ${id}`);
    return mgr;
  }

  async function start(
    id: string,
    opts?: ServiceStartOptions,
  ): Promise<string> {
    return getManager(id).start(id, opts);
  }

  async function stop(id: string, instanceId?: string): Promise<void> {
    return getManager(id).stop(id, instanceId);
  }

  function list(serviceId?: string): ServiceInstanceStatus[] {
    if (serviceId) {
      return getManager(serviceId).list(serviceId);
    }
    // Aggregate from all managers
    const results: ServiceInstanceStatus[] = [];
    for (const mgr of managers) {
      results.push(...mgr.list());
    }
    return results;
  }

  function getDefinition(id: string): ServiceDefinition | undefined {
    const mgr = routeMap.get(id);
    return mgr?.getDefinition(id);
  }

  function logs(id: string, instanceId?: string, lines?: number): string {
    return getManager(id).logs(id, instanceId, lines);
  }

  function watchLogs(
    id: string,
    instanceId: string,
    onLine: (line: string) => void,
  ): () => void {
    return getManager(id).watchLogs(id, instanceId, onLine);
  }

  function watchChunks(
    id: string,
    instanceId: string,
    onChunk: (chunk: StreamChunk) => void,
  ): () => void {
    return getManager(id).watchChunks(id, instanceId, onChunk);
  }

  function scanProjects(id: string, rootDir: string) {
    return getManager(id).scanProjects(id, rootDir);
  }

  function purgeStoppedInstances(id: string): void {
    return getManager(id).purgeStoppedInstances(id);
  }

  return {
    start,
    stop,
    list,
    getDefinition,
    logs,
    watchLogs,
    watchChunks,
    scanProjects,
    purgeStoppedInstances,
  };
}
