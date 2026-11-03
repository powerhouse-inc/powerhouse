/** Whether a switchboard runs a workflow runtime; "unknown" when it could not say. */
export type SwitchboardWorkflows = boolean | "unknown";

/** One switchboard this app reaches. */
export interface SwitchboardEntry {
  /**
   * What the host calls it: a remote backend's name (the host file's key,
   * e.g. `sb`), or the host and path of a synced drive's switchboard.
   */
  readonly name: string;
  /** `<origin>[/<prefix>]`, e.g. `http://localhost:2540`. */
  readonly base: string;
  /** `<base>/graphql`. */
  readonly graphqlUrl: string;
  /** A router backend from the host's config, or a synced drive's remote. */
  readonly via: "backend" | "sync";
  /** From the backend's facts; a synced drive's switchboard is not asked. */
  readonly workflows: SwitchboardWorkflows;
}

/** The switchboards an app reaches, and which one serves a document. */
export interface SwitchboardDirectory {
  /** Every switchboard, in configuration order; read again on each call. */
  list(): readonly SwitchboardEntry[];
  /**
   * The switchboard that serves a document or drive; undefined when the
   * directory can't place it (a document kept only in this tab, or one a
   * synced drive holds).
   */
  locate(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<SwitchboardEntry | undefined>;
}
