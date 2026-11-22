/**
 * Powerhouse integration for ph-clint: a CLI's reactor is a client of a
 * RUNNING switchboard (`attachDefaultReactor`, which a host runner calls),
 * with its drives, change subscriptions, signing rules and attachment
 * service. clint starts no reactor, switchboard or Connect of its own.
 *
 * All Powerhouse imports are lazy — the library works without them installed.
 */

export type {
  ReactorContext,
  ReactorSetupContext,
  ReactorConfiguration,
  RemoteReactorConfig,
  RemoteReactorSource,
  DriveConfig,
  EnsureDriveClient,
  DriveEntry,
  FolderEntry,
  FolderOperations,
  SubscriptionConfig,
  DocumentRegistry,
  AnyRegistry,
  RegistryEntry,
  TypedReactorClient,
  TypedDocumentChangeEvent,
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

export { bridgeSubscriptions } from "./subscriptions.js";
export { ensureDrive } from "./drive.js";
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
import { ensureDrive } from "./drive.js";
import { bridgeSubscriptions } from "./subscriptions.js";
import { createReactorWrites } from "./writes.js";
import type {
  ReactorContext,
  ReactorSetupContext,
  DriveEntry,
  DocumentRegistry,
  AnyRegistry,
  IAttachmentService,
  RemoteReactorConfig,
  RemoteReactorSource,
  TypedReactorClient,
} from "./types.js";

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
}

/**
 * The `ReactorConfiguration.remote` a runner attaches with: the config as
 * given, or the function's answer for this setup context. None: `{}`.
 */
export async function resolveRemoteReactorConfig<
  R extends DocumentRegistry = AnyRegistry,
>(
  source: RemoteReactorSource<R> | undefined,
  setup: ReactorSetupContext<R>,
): Promise<RemoteReactorConfig<R>> {
  if (typeof source === "function") return source(setup);
  return source ?? {};
}

/**
 * The attachment service of the switchboard at `endpoint`. Its
 * `/attachments/*` routes mount at the host root, so the origin is used.
 */
async function remoteAttachmentService(
  endpoint: string,
  jwtHandler: ((url: string) => Promise<string | undefined>) | undefined,
): Promise<IAttachmentService> {
  const { createRemoteAttachmentService } =
    await import("@powerhousedao/reactor-attachments");
  return createRemoteAttachmentService({
    remoteUrl: new URL(endpoint).origin,
    ...(jwtHandler ? { jwtHandler } : {}),
  });
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
 * Build a ReactorContext on a RUNNING switchboard, with the drives and
 * subscriptions the options ask for. The default drive is the first personal
 * drive the options ask for, else the first, else the one the address names.
 * The signer, its rules and its watch go to
 * `createReactorWrites`, which emits `powerhouse:writes:ready` on `ctx.emit`;
 * a signer change also reconnects the realtime socket with the current
 * bearer. Without `ctx.attachments` the context gets the switchboard's own
 * attachment service, authenticated by `ctx.attachmentJwtHandler`, else by
 * `tokenProvider`. `shutdown` releases only this process's side (the
 * bridged subscriptions, the signer watch, the client) and runs once.
 */
export async function attachDefaultReactor<
  R extends DocumentRegistry = AnyRegistry,
>(
  ctx: ReactorSetupContext<R>,
  options: AttachDefaultReactorOptions<R>,
): Promise<ReactorContext<R>> {
  const { attachRemoteReactor } = await import("./remote-reactor.js");
  const { switchboardOfDrive } =
    await import("@powerhousedao/shared/host-tokens");

  // A socket presents the credentials it opened with until it is replaced,
  // and the bearer follows the signer's user.
  let credentialsChanged = (): void => undefined;
  const { onSignerChange } = options;
  const handle = createReactorWrites({
    signer: options.signer,
    legacyDocuments: options.legacyDocuments,
    accepts: options.accepts,
    ...(onSignerChange
      ? {
          onSignerChange: (listener: () => void) =>
            onSignerChange(() => {
              credentialsChanged();
              listener();
            }),
        }
      : {}),
    ...(ctx.emit ? { emit: ctx.emit } : {}),
  });

  let attachment: Awaited<ReturnType<typeof attachRemoteReactor>>;
  try {
    attachment = await attachRemoteReactor({
      url: options.url,
      documentModels: options.documentModels ?? [],
      ...(handle.signer ? { signer: handle.signer } : {}),
      ...(options.tokenProvider
        ? { tokenProvider: options.tokenProvider }
        : {}),
    });
  } catch (error) {
    handle.stop();
    throw error;
  }
  const client = attachment.client as IReactorClient & {
    dispose?: () => void;
    notifyCredentialsChanged?: () => void;
  };
  credentialsChanged = () => client.notifyCredentialsChanged?.();

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
    unsubscribe = bridgeSubscriptions<R>(
      client,
      options.subscriptions,
      ctx.emit,
    );
  }

  const { tokenProvider } = options;
  const attachments =
    ctx.attachments ??
    (await remoteAttachmentService(
      attachment.endpoint,
      ctx.attachmentJwtHandler ?? (tokenProvider && (() => tokenProvider())),
    ));

  let stopped = false;
  const result: ReactorContext<R> = {
    client: client as unknown as TypedReactorClient<R>,
    driveId,
    personalDriveId: personal?.id,
    drives,
    switchboardUrl: attachment.endpoint,
    ...(driveUrl ? { driveUrl } : {}),
    attachments,
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
