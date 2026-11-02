import {
  KEYFRAME_ADMIN_OPERATIONS,
  type KeyframeCleanupRun,
  type KeyframeReclaim,
} from "@powerhousedao/reactor";
import type { KeyframeLevers } from "../types.js";
import {
  GraphqlInspectionTransport,
  type RemoteInspectionTransportOptions,
} from "./transport.js";

/** Keyframe levers over a host's `inspection-admin` subgraph, served only to its listed admins. */
export class RemoteKeyframeLevers implements KeyframeLevers {
  private readonly transport: GraphqlInspectionTransport;

  constructor(options: RemoteInspectionTransportOptions) {
    this.transport = new GraphqlInspectionTransport(options);
  }

  /** False without the subgraph, without the admin, or on a host from before these levers. */
  async served(): Promise<boolean> {
    try {
      const data = await this.transport.request<{
        inspectionAdmin: { keyframes?: boolean };
      }>("keyframeAccess", KEYFRAME_ADMIN_OPERATIONS.access);
      return data.inspectionAdmin.keyframes === true;
    } catch {
      return false;
    }
  }

  async startKeyframeCleanup(options: {
    dryRun: boolean;
  }): Promise<KeyframeCleanupRun> {
    const data = await this.transport.request<{
      inspectionStartKeyframeCleanup: KeyframeCleanupRun;
    }>("startKeyframeCleanup", KEYFRAME_ADMIN_OPERATIONS.startCleanup, {
      dryRun: options.dryRun,
    });
    return data.inspectionStartKeyframeCleanup;
  }

  async getKeyframeCleanup(): Promise<KeyframeCleanupRun | null> {
    const data = await this.transport.request<{
      inspectionKeyframeCleanup: KeyframeCleanupRun | null;
    }>("getKeyframeCleanup", KEYFRAME_ADMIN_OPERATIONS.cleanup);
    return data.inspectionKeyframeCleanup;
  }

  async cancelKeyframeCleanup(): Promise<void> {
    await this.transport.request(
      "cancelKeyframeCleanup",
      KEYFRAME_ADMIN_OPERATIONS.cancelCleanup,
    );
  }

  async reclaimKeyframeSpace(): Promise<KeyframeReclaim> {
    const data = await this.transport.request<{
      inspectionReclaimKeyframeSpace: KeyframeReclaim;
    }>("reclaimKeyframeSpace", KEYFRAME_ADMIN_OPERATIONS.reclaim);
    return data.inspectionReclaimKeyframeSpace;
  }

  async getKeyframeReclaim(): Promise<KeyframeReclaim | null> {
    const data = await this.transport.request<{
      inspectionKeyframeReclaim: KeyframeReclaim | null;
    }>("getKeyframeReclaim", KEYFRAME_ADMIN_OPERATIONS.reclaimStatus);
    return data.inspectionKeyframeReclaim;
  }
}
