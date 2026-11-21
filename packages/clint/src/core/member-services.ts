import fs from "node:fs";
import type { MemberStatus } from "@powerhousedao/host-core";
import { sanitizeLogText, watchLogFile } from "./services.js";
import type {
  ServiceInstanceStatus,
  ServiceManager,
  StreamChunk,
} from "./types.js";

/**
 * The members of the compound a CLI is the foreground member of, as a
 * ServiceManager, so the panel and the log calls show them next to the
 * CLI's own services (plan section 2a). A member is one instance: its
 * service id and instance id are its name. The compound owns their life:
 * start and stop refuse, and stopAll leaves them to it.
 */
export function createMemberServiceManager(
  members: () => readonly MemberStatus[],
): ServiceManager {
  const memberOf = (id: string): MemberStatus => {
    const member = members().find((m) => m.name === id);
    if (!member) throw new Error(`Unknown service: ${id}`);
    return member;
  };
  const instanceOf = (member: MemberStatus): ServiceInstanceStatus => ({
    serviceId: member.name,
    instanceId: member.name,
    name: member.name,
    status: member.status,
    ...(member.pid !== undefined ? { pid: member.pid } : {}),
    endpoints: { ...member.endpoints },
    ...(member.error !== undefined ? { error: member.error } : {}),
  });
  const owned = (id: string) =>
    new Error(
      `${id} is a member of the stack this CLI runs in: it starts and stops with the stack.`,
    );

  return {
    start(id) {
      memberOf(id);
      return Promise.reject(owned(id));
    },
    stop(id) {
      memberOf(id);
      return Promise.reject(owned(id));
    },
    stopAll: () => Promise.resolve(),
    list(serviceId) {
      return members()
        .filter((m) => serviceId === undefined || m.name === serviceId)
        .map(instanceOf);
    },
    getDefinition: () => undefined,
    logs(id, _instanceId, lines = 50) {
      const member = memberOf(id);
      const footer = `\n— ${member.name} [${member.status}] log`;
      if (!member.logFile) {
        return `${member.name} runs in this process: its output is this process's.${footer}`;
      }
      try {
        const content = fs.readFileSync(member.logFile, "utf-8");
        const all = sanitizeLogText(content).split("\n");
        return sanitizeLogText(all.slice(-lines).join("\n")) + footer;
      } catch {
        return "";
      }
    },
    watchLogs(id, _instanceId, onLine) {
      const member = memberOf(id);
      if (!member.logFile) return () => {};
      return watchLogFile(member.logFile, onLine);
    },
    watchChunks(
      id: string,
      _instanceId: string,
      _onChunk: (chunk: StreamChunk) => void,
    ) {
      memberOf(id);
      return () => {};
    },
    scanProjects: () => [],
    purgeStoppedInstances: () => undefined,
  };
}
