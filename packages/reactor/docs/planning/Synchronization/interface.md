# Interface

```tsx
type RemoteFilter = {
  /**
   * Array of document types to include, use ["*"] for all.
   *
   * Every filter must be decomposable into one or more collection queries by the
   * sync manager. We derive collection ids via the canonical driveCollectionId(branch, driveId)
   * helper, so at least one entry in `documentId` must reference a drive document
   * for every branch in `branch`. If a filter cannot be translated into collection ids
   * (for example, a single non-drive document), `ISyncManager` rejects it with an error.
   */
  documentType: string[];

  /**
   * Array of document IDs. Drive ids seed collection ids; non-drive ids are only
   * allowed when the manager can still derive collection ids (e.g., explicit drive ids
   * plus `ViewFilter` scoping). Filters that cannot be decomposed into collection queries
   * must throw during registration.
   */
  documentId: string[];

  /** Array of operation scopes to include, use ["*"] for all */
  scope: string[];

  /** Array of branches to include, use ["*"] for all */
  branch: string[];
};

type RemoteOptions = {
  //
};

type Remote = {
  /** The name of the remote. Must be unique. */
  name: string;

  /** The channel to use for this remote */
  channel: IChannel;

  /** Filter to specify which documents this remote should receive updates for */
  filter: RemoteFilter;

  /** Options for the remote */
  options: RemoteOptions;
};

interface ISynchronizationManager {
  /**
   * Get details of a specific remote
   *
   * @param name - The name of the remote
   * @returns The remote
   */
  get(name: string): Promise<Remote | null>;

  /**
   * Add a new remote
   *
   * @param name - The name of the remote
   * @param channel - The channel to use for this remote
   * @param filter - The filter to use for this remote
   * @param options - The options for this remote
   * @returns The remote
   */
  add(
    name: string,
    channel: IChannel,
    filter?: RemoteFilter,
    options?: RemoteOptions,
  ): Promise<Remote>;

  /**
   * Remove an existing remote
   *
   * @param name - The name of the remote
   * @returns The remote
   */
  remove(name: string): Promise<void>;

  /**
   * List all configured remotes
   *
   * @returns The remotes
   */
  list(): Remote[];

  /**
   * Update the filter of an existing remote
   *
   * @param name - The name of the remote
   * @param filter - The filter to use for this remote
   *
   * @returns The remote
   */
  setFilter(name: string, filter: RemoteFilter): Promise<void>;
}
```
