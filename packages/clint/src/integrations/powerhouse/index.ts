/**
 * Powerhouse integration for ph-clint.
 *
 * Three independently-toggleable layers:
 * - Phase 1: Internal Reactor (in-process document store)
 * - Phase 2: Switchboard (GraphQL + MCP endpoint wrapping the Reactor)
 * - Phase 3: Connect (persistent web UI child process)
 *
 * All Powerhouse imports are lazy — the library works without them installed.
 */

export type {
  ReactorContext,
  ReactorSetupContext,
  ReactorConfiguration,
  PowerhouseIntegrationOptions,
  DriveConfig,
  DriveEntry,
  FolderEntry,
  FolderOperations,
  SubscriptionConfig,
  SwitchboardConfig,
  ConnectConfig,
  SwitchboardInstance,
  DocumentRegistry,
  AnyRegistry,
  RegistryEntry,
  TypedReactorClient,
  TypedDocumentChangeEvent,
  ReactorClientModule,
  IAttachmentService,
  AttachmentRef,
  AttachmentResponse,
  AttachmentUploadResult,
  ReserveAttachmentOptions,
  AttachmentHeader,
} from "./types.js";

export type { InferRegistry, ActionOf } from "./registry.js";
export { defineRegistry } from "./registry.js";

export { connectServiceDefinition } from "./connect.js";
export { defaultPort, resolvePort, resolveReactorDefaults } from "./ports.js";
export { deterministicId } from "./identity.js";
export { bridgeSubscriptions } from "./subscriptions.js";
export { ensureDrive, ensureRemoteDrive } from "./drive.js";
export { buildReactor } from "./reactor.js";
export { startSwitchboard } from "./switchboard.js";
export type { StartSwitchboardOptions } from "./switchboard.js";
export { createDocumentChangeTrigger } from "./change-trigger.js";
export type { DocumentChangeTriggerOptions } from "./change-trigger.js";
export { isDocType } from "./type-guard.js";
export { createFolderOperations, createFolderCommands } from "./folders.js";
export { createAttachmentCommands } from "./attachment-commands.js";
export {
  getAttachmentService,
  asRef,
  inferMimeType,
  fileToBlob,
  isAttachmentAlreadyExists,
} from "./attachment.js";

import type { DocumentModelModule } from "document-model";
import type {
  ReactorContext,
  ReactorSetupContext,
  DriveConfig,
  DriveEntry,
  SubscriptionConfig,
  DocumentRegistry,
  AnyRegistry,
  TypedReactorClient,
} from "./types.js";

/**
 * Options for buildDefaultReactor().
 */
export interface BuildDefaultReactorOptions<
  R extends DocumentRegistry = AnyRegistry,
> {
  /** Document model modules to register with the Reactor. */
  documentModels: DocumentModelModule[];
  /** Single drive (sugar for drives: [{ ...drive, role: 'personal' }]). */
  drive?: DriveConfig;
  /** Multi-drive configuration. First 'personal' drive = personalDriveId = driveId. */
  drives?: Array<
    DriveConfig & { role: "personal" | "watched"; remoteUrl?: string }
  >;
  /** Subscribe to document changes → event bus. */
  subscriptions?: SubscriptionConfig<R>;
}

/**
 * Build a ReactorContext using the standard composition:
 * buildReactor() + ensureDrive() + bridgeSubscriptions() + startSwitchboard().
 *
 * This is the common-case helper for configureReactor().create.
 * Advanced users can write their own factory.
 */
export async function buildDefaultReactor<
  R extends DocumentRegistry = AnyRegistry,
>(
  ctx: ReactorSetupContext<R>,
  options: BuildDefaultReactorOptions<R>,
): Promise<ReactorContext<R>> {
  const { buildReactor } = await import("./reactor.js");
  const { ensureDrive, ensureRemoteDrive } = await import("./drive.js");

  const reactorModule = await buildReactor({
    documentModels: options.documentModels,
    storagePath: ctx.workspace.getStoreFolder("reactor-storage"),
    enableSync: !!ctx.switchboard?.enabled,
  });

  // Normalize drive config
  const driveConfigs =
    options.drives ??
    (options.drive
      ? [{ ...options.drive, role: "personal" as const }]
      : [{ name: "default", role: "personal" as const }]);

  // Create/find all drives
  const drives: DriveEntry[] = [];
  for (const cfg of driveConfigs) {
    if (cfg.remoteUrl) {
      const drive = await ensureRemoteDrive(
        reactorModule,
        cfg.remoteUrl,
        cfg.name,
      );
      drives.push({ ...drive, role: cfg.role, remoteUrl: cfg.remoteUrl });
    } else {
      const drive = await ensureDrive(reactorModule, cfg);
      drives.push({ ...drive, role: cfg.role });
    }
  }

  // Resolve personal drive
  const personal = drives.find((d) => d.role === "personal");
  const personalDriveId = personal?.id ?? drives[0]?.id ?? "";
  const driveId = personalDriveId;

  let unsubscribe: (() => void) | undefined;
  if (options.subscriptions && ctx.emit) {
    const { bridgeSubscriptions } = await import("./subscriptions.js");
    unsubscribe = bridgeSubscriptions<R>(
      reactorModule.client,
      options.subscriptions,
      ctx.emit,
    );
  }

  const result: ReactorContext<R> = {
    client: reactorModule.client as TypedReactorClient<R>,
    driveId,
    personalDriveId,
    drives,
    attachments: ctx.attachments,
    _module: reactorModule,
    async shutdown() {
      unsubscribe?.();
      try {
        const status = reactorModule.reactor.kill();
        await Promise.race([
          status.completed,
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Best-effort shutdown
      }
    },
  };

  ctx.emit?.("powerhouse:ready", { driveId });

  return result;
}
