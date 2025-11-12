# Interface

```tsx

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
