import type {
  DocumentModelModule,
  PHDocument,
  ProtocolVersions,
  Supports,
} from "@powerhousedao/shared/document-model";
import {
  fitCreateBaseReducer,
  selectProtocolVersions,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { DriveCollectionId } from "../cache/operation-index-types.js";
import type {
  CreateProtocolVersionsOptions,
  ProtocolSelection,
} from "./types.js";

export type CreateProtocolSelectorDeps = {
  selection: ProtocolSelection;
  /** The parent's id; undefined when it does not resolve. */
  resolveParent(
    parentIdentifier: string,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  /** The registered versions of `documentType`. */
  modules(
    documentType: string,
    signal?: AbortSignal,
  ): Promise<readonly DocumentModelModule[]>;
  logger: ILogger;
};

/** Where an in-process client chooses a new document's protocol versions. */
export class CreateProtocolSelector {
  constructor(private readonly deps: CreateProtocolSelectorDeps) {}

  /** With `loadModel`, a lazily loaded model fits as if registered at boot. */
  async select(
    { documentType, parentIdentifier }: CreateProtocolVersionsOptions,
    { loadModel = false }: { loadModel?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    const { selection, logger } = this.deps;
    if (loadModel && selection.loadModel && documentType !== undefined) {
      try {
        await selection.loadModel(documentType);
      } catch {
        // The CREATE gate fails the job.
      }
    }
    const members = await this.members(parentIdentifier, signal);
    const selected = selectProtocolVersions({ ...selection, members });
    if (documentType === undefined) {
      return selected;
    }
    return fitCreateBaseReducer(
      selected,
      documentType,
      await this.deps.modules(documentType, signal),
      logger,
    );
  }

  private async members(
    parentIdentifier: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Supports[]> {
    const { agreement, collectionsOf } = this.deps.selection;
    if (parentIdentifier === undefined || !agreement) return [];
    let parentId: string | undefined;
    try {
      parentId = await this.deps.resolveParent(parentIdentifier, signal);
    } catch {
      parentId = undefined;
    }
    if (parentId === undefined) return [];
    const memberships = await collectionsOf([parentId]);
    const collectionIds = [
      ...(memberships[parentId] ?? []),
      DriveCollectionId.forDrive(parentId).key,
    ];
    return [...agreement().members(collectionIds).values()];
  }
}
