import type { ProcessorRerunOptions } from "@powerhousedao/shared/processors";
import type { ProcessorLevers } from "../types.js";
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
} as const;

/** reactor-api mounts the levers beside inspection, at `<graphql>/inspection-admin`. */
export function inspectionAdminEndpoint(url: string): string {
  return `${url.replace(/\/+$/, "")}/inspection-admin`;
}

/** Processor levers over a host's `inspection-admin` subgraph, served only to its listed admins. */
export class RemoteProcessorLevers implements ProcessorLevers {
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
}
