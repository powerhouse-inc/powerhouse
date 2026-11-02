import type {
  CatchUpPrioritySetting,
  MemoryTelemetryChange,
} from "@powerhousedao/reactor";
import type { ProcessorRerunOptions } from "@powerhousedao/shared/processors";
import type { MemoryLevers, ProcessorLevers } from "../types.js";
import {
  GraphqlInspectionTransport,
  type RemoteInspectionTransportOptions,
} from "./transport.js";

/** The operations of a host's `inspection-admin` subgraph. */
export const INSPECTION_ADMIN_OPERATIONS = {
  access: `query ReactorInspectionAdminAccess {
    inspectionAdmin { processors }
  }`,
  retryProcessor: `mutation ReactorInspectionRetryProcessor($processorId: String!) {
    inspectionRetryProcessor(processorId: $processorId)
  }`,
  rerunProcessor: `mutation ReactorInspectionRerunProcessor(
    $processorId: String!
    $clear: Boolean!
    $fromOrdinal: Float!
  ) {
    inspectionRerunProcessor(
      processorId: $processorId
      clear: $clear
      fromOrdinal: $fromOrdinal
    )
  }`,
  setCatchUpPriority: `mutation ReactorInspectionSetCatchUpPriority(
    $mode: String!
    $level: Int
  ) {
    inspectionSetCatchUpPriority(mode: $mode, level: $level)
  }`,
  setMemoryTelemetry: `mutation ReactorInspectionSetMemoryTelemetry(
    $enabled: Boolean!
    $intervalMs: Int
    $outputs: [String!]
  ) {
    inspectionSetMemoryTelemetry(
      enabled: $enabled
      intervalMs: $intervalMs
      outputs: $outputs
    )
  }`,
  writeHeapSnapshot: `mutation ReactorInspectionWriteHeapSnapshot($force: Boolean) {
    inspectionWriteHeapSnapshot(force: $force)
  }`,
} as const;

/** reactor-api mounts the levers beside inspection, at `<graphql>/inspection-admin`. */
export function inspectionAdminEndpoint(url: string): string {
  return `${url.replace(/\/+$/, "")}/inspection-admin`;
}

/** Processor levers over a host's `inspection-admin` subgraph, served only to its listed admins. */
export class RemoteProcessorLevers implements ProcessorLevers, MemoryLevers {
  private readonly transport: GraphqlInspectionTransport;

  constructor(options: RemoteInspectionTransportOptions) {
    this.transport = new GraphqlInspectionTransport(options);
  }

  get endpoint(): string {
    return this.transport.endpoint;
  }

  /** Whether the host serves the levers to this caller: false without the subgraph or the admin. */
  async served(): Promise<boolean> {
    try {
      const data = await this.transport.request<{
        inspectionAdmin: { processors: boolean };
      }>("access", INSPECTION_ADMIN_OPERATIONS.access);
      return data.inspectionAdmin.processors;
    } catch {
      return false;
    }
  }

  async retryProcessor(processorId: string): Promise<void> {
    await this.transport.request(
      "retryProcessor",
      INSPECTION_ADMIN_OPERATIONS.retryProcessor,
      { processorId },
    );
  }

  async rerunProcessor(
    processorId: string,
    options: ProcessorRerunOptions,
  ): Promise<void> {
    await this.transport.request(
      "rerunProcessor",
      INSPECTION_ADMIN_OPERATIONS.rerunProcessor,
      { processorId, clear: options.clear, fromOrdinal: options.fromOrdinal },
    );
  }

  async setCatchUpPriority(setting: CatchUpPrioritySetting): Promise<void> {
    await this.transport.request(
      "setCatchUpPriority",
      INSPECTION_ADMIN_OPERATIONS.setCatchUpPriority,
      setting.mode === "fixed"
        ? { mode: "fixed", level: setting.level }
        : { mode: "dynamic", level: null },
    );
  }

  async setMemoryTelemetry(change: MemoryTelemetryChange): Promise<void> {
    await this.transport.request(
      "setMemoryTelemetry",
      INSPECTION_ADMIN_OPERATIONS.setMemoryTelemetry,
      change,
    );
  }

  async writeHeapSnapshot(force = false): Promise<string> {
    const data = await this.transport.request<{
      inspectionWriteHeapSnapshot: string;
    }>("writeHeapSnapshot", INSPECTION_ADMIN_OPERATIONS.writeHeapSnapshot, {
      force,
    });
    return data.inspectionWriteHeapSnapshot;
  }
}
