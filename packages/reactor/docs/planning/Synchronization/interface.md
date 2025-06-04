# Interface

```tsx
type RemoteFilter = {
  /** Array of document types to include, use ["*"] for all */
  documentType?: string[];

  /** Array of document IDs to include, use ["*"] for all */
  documentId?: string[];

  /** Array of operation scopes to include, use ["*"] for all */
  scope?: string[];
  
  /** Array of branches to include, use ["*"] for all */
  branch?: string[];
};

type RemoteOptions = {
  fetch?: boolean;
  push?: boolean;
  mirror?: boolean;
  tags?: boolean;
};

type Remote = {
  name: string;
  channel: IChannel;

  /** Filter to specify which documents this remote should receive updates for */
  filter?: RemoteFilter;
  options?: RemoteOptions;
};

interface ISynchronizationManager {
  addRemote(name: string, channel: IChannel, filter?: RemoteFilter, options?: RemoteOptions): Promise<void>;
  
  // Remove an existing remote by name
  removeRemote(name: string): Promise<void>;
  
  // List all configured remotes
  listRemotes(): Promise<Remote[]>;
  
  // Get details of a specific remote
  getRemote(name: string): Promise<Remote | null>;
  
  // Update the filter of an existing remote
  setRemoteFilter(name: string, filter: RemoteFilter): Promise<void>;
  
  // Rename an existing remote
  renameRemote(oldName: string, newName: string): Promise<void>;
}