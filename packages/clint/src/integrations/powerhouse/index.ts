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
  RemoteReactorConfig,
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
  ReactorWrites,
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
export { attachRemoteReactor } from "./remote-reactor.js";
export type {
  AttachRemoteReactorOptions,
  RemoteReactorAttachment,
} from "./remote-reactor.js";
export {
  SignerNotReadyError,
  createGatedSigner,
  signerReady,
  policyOfHeader,
} from "./signing.js";
export type { SignaturePolicy } from "./signing.js";
export { createReactorWrites } from "./writes.js";
export type { ReactorWritesOptions, ReactorWritesHandle } from "./writes.js";
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

import type { IReactorClient } from "@powerhousedao/reactor";
import type { BearerTokenProvider } from "@powerhousedao/reactor-browser/graphql-client";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { DocumentModelModule } from "document-model";
import type {
  ReactorContext,
  ReactorSetupContext,
  DriveConfig,
  DriveEntry,
  SubscriptionConfig,
  DocumentRegistry,
  AnyRegistry,
  RemoteReactorConfig,
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
      const drive = await ensureDrive(reactorModule.client, cfg);
      // A drive the host creates later is not listed yet.
      if (drive.deferred) continue;
      drives.push({ id: drive.id, name: drive.name, role: cfg.role });
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

  // The embedded reactor signs with its own LocalSigner, which always has a
  // user: writes are always ready, so no signer is watched here.
  const { createReactorWrites } = await import("./writes.js");
  const { writes } = createReactorWrites();

  const result: ReactorContext<R> = {
    client: reactorModule.client as TypedReactorClient<R>,
    driveId,
    personalDriveId,
    drives,
    attachments: ctx.attachments,
    _module: reactorModule,
    writes,
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

/**
 * Options for attachDefaultReactor(): where the switchboard is, how the
 * client signs and authenticates, and what the CLI's reactor holds there.
 */
export interface AttachDefaultReactorOptions<
  R extends DocumentRegistry = AnyRegistry,
> extends RemoteReactorConfig<R> {
  /** A switchboard drive address, `<switchboard>/d/<slug>`; its GraphQL
   * endpoint or bare origin attach too, but name no drive. */
  url: string;
  /** Signs the actions the client pushes (see `createReactorWrites`);
   * without one they go out unsigned. */
  signer?: ISigner;
  /** The bearer per request, for an authenticated switchboard. */
  tokenProvider?: BearerTokenProvider;
}

/** The id of the drive a switchboard serves under `slug`. */
async function driveOfAddress(
  client: IReactorClient,
  slug: string,
  endpoint: string,
): Promise<string> {
  try {
    return (await client.get(slug)).header.id;
  } catch (cause) {
    throw new Error(
      `The switchboard at ${endpoint} serves no drive "${slug}": the drive address must name one of its drives.`,
      { cause },
    );
  }
}

/**
 * Build a ReactorContext on a RUNNING switchboard: the remote counterpart of
 * buildDefaultReactor(), with the same drives and subscriptions, and no
 * `_module`, so no embedded switchboard can start over it. The default drive
 * is the first personal drive the options ask for, else the first, else the
 * one the address names. `shutdown` releases only this process's side (the
 * bridged subscriptions, the signer watch, the client) and runs once.
 */
export async function attachDefaultReactor<
  R extends DocumentRegistry = AnyRegistry,
>(
  ctx: ReactorSetupContext<R>,
  options: AttachDefaultReactorOptions<R>,
): Promise<ReactorContext<R>> {
  const { attachRemoteReactor } = await import("./remote-reactor.js");
  const { ensureDrive } = await import("./drive.js");
  const { createReactorWrites } = await import("./writes.js");
  const { switchboardOfDrive } =
    await import("@powerhousedao/shared/host-tokens");

  const handle = createReactorWrites({ signer: options.signer });
  const attachment = await attachRemoteReactor({
    url: options.url,
    documentModels: options.documentModels ?? [],
    ...(handle.signer ? { signer: handle.signer } : {}),
    ...(options.tokenProvider ? { tokenProvider: options.tokenProvider } : {}),
  });
  const client = attachment.client as IReactorClient & {
    dispose?: () => void;
  };

  const driveConfigs =
    options.drives ??
    (options.drive ? [{ ...options.drive, role: "personal" as const }] : []);
  const drives: DriveEntry[] = [];
  for (const cfg of driveConfigs) {
    const drive = await ensureDrive(client, cfg);
    // A drive the host creates later is not listed yet.
    if (drive.deferred) continue;
    drives.push({ id: drive.id, name: drive.name, role: cfg.role });
  }
  const personal = drives.find((d) => d.role === "personal");
  const addressed = switchboardOfDrive(options.url);
  let driveId = personal?.id ?? drives[0]?.id ?? "";
  let driveUrl =
    addressed && driveId ? `${addressed.base}/d/${driveId}` : undefined;
  if (!driveId && addressed) {
    driveId = await driveOfAddress(client, addressed.slug, attachment.endpoint);
    driveUrl = options.url;
  }

  let unsubscribe: (() => void) | undefined;
  if (options.subscriptions && ctx.emit) {
    const { bridgeSubscriptions } = await import("./subscriptions.js");
    unsubscribe = bridgeSubscriptions<R>(
      client,
      options.subscriptions,
      ctx.emit,
    );
  }

  let stopped = false;
  const result: ReactorContext<R> = {
    client: client as unknown as TypedReactorClient<R>,
    driveId,
    personalDriveId: personal?.id,
    drives,
    switchboardUrl: attachment.endpoint,
    ...(driveUrl ? { driveUrl } : {}),
    attachments: ctx.attachments,
    writes: handle.writes,
    shutdown() {
      if (stopped) return Promise.resolve();
      stopped = true;
      unsubscribe?.();
      handle.stop();
      client.dispose?.();
      return Promise.resolve();
    },
  };

  ctx.emit?.("powerhouse:ready", { driveId });

  return result;
}
