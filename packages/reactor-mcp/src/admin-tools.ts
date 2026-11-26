import type { ISyncManager } from "@powerhousedao/reactor";
import { DriveCollectionId } from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import { logAdministration } from "@powerhousedao/shared/processors";
import { z } from "zod";
import type { HostAccessGate } from "./host-access.js";
import { logger } from "./logger.js";
import { defineTool, driveTools, ReactorToolError } from "./tools/index.js";

/** URLs `addRemoteDrive` may fetch: `"*"`, origins or URL prefixes, patterns, or a predicate. */
export type RemoteDriveAllowlist =
  | "*"
  | readonly (string | RegExp)[]
  | ((url: URL) => boolean);

export type ReactorAdminToolsOptions = {
  syncManager?: ISyncManager;
  /** Omitted, `addRemoteDrive` is not mounted. */
  remoteDriveUrls?: RemoteDriveAllowlist;
  /** Who `deleteDrive` reads the drive as; omitted, the client's signer. */
  subject?: AuthSubject;
  /** The host's ACL for the caller; omitted, none. */
  gate?: HostAccessGate;
  /** Who calls, for the log of what it administers. */
  caller?: { address?: string; label?: string };
};

function parseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ReactorToolError("INVALID_ACTION", `Invalid URL: ${value}`);
  }
}

export function isRemoteDriveUrlAllowed(
  url: URL,
  allow: RemoteDriveAllowlist | undefined,
): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!allow) return false;
  if (allow === "*") return true;
  if (typeof allow === "function") return allow(url);
  return allow.some((entry) => {
    // A stateless copy: `test` on a /g or /y pattern advances `lastIndex`.
    if (entry instanceof RegExp) {
      return new RegExp(entry.source, entry.flags.replace(/[gy]/g, "")).test(
        url.href,
      );
    }
    const allowed = parseUrl(entry);
    if (allowed.origin !== url.origin) return false;
    // A bare origin allows every path on it; a path allows itself and below.
    const prefix = allowed.pathname.replace(/\/+$/, "");
    return (
      prefix === "" ||
      url.pathname === prefix ||
      url.pathname.startsWith(`${prefix}/`)
    );
  });
}

function addRemoteDriveTool(options: ReactorAdminToolsOptions) {
  return defineTool({
    name: "addRemoteDrive",
    title: "Connect a remote drive",
    description:
      "Connect to a remote drive by its URL and sync it. Only URLs this server allows are fetched.",
    inputSchema: z.object({
      url: z.string().describe("URL of the remote drive"),
    }),
    outputSchema: z.object({ driveId: z.string() }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async execute(args, { signal }) {
      const { syncManager, remoteDriveUrls, gate } = options;
      // Sync configuration is host-wide: the operator's, whatever the policy.
      if (gate && !gate.operator) {
        throw new ReactorToolError(
          "FORBIDDEN",
          "Forbidden: only an administrator may connect remote drives",
        );
      }
      if (!syncManager) {
        throw new ReactorToolError(
          "FORBIDDEN",
          "Remote drives are not available: this server has no sync manager",
        );
      }
      const url = parseUrl(args.url);
      if (!isRemoteDriveUrlAllowed(url, remoteDriveUrls)) {
        throw new ReactorToolError(
          "FORBIDDEN",
          `This server does not allow fetching ${url.origin}`,
        );
      }
      // Redirects would bypass the allowlist.
      const response = await fetch(url, { signal, redirect: "manual" });
      if (
        response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new ReactorToolError(
          "FORBIDDEN",
          `${url.href} redirected; give the drive's final URL`,
        );
      }
      if (!response.ok) {
        throw new ReactorToolError(
          response.status === 404 ? "NOT_FOUND" : "CONFLICT",
          `Failed to resolve drive info from ${url.href}: HTTP ${response.status}`,
        );
      }
      const info = (await response.json()) as {
        id?: unknown;
        graphqlEndpoint?: unknown;
      };
      if (
        typeof info.id !== "string" ||
        typeof info.graphqlEndpoint !== "string"
      ) {
        throw new ReactorToolError(
          "NOT_FOUND",
          `${url.href} did not describe a drive`,
        );
      }
      let endpoint: URL;
      try {
        endpoint = new URL(info.graphqlEndpoint, url);
      } catch {
        throw new ReactorToolError(
          "NOT_FOUND",
          `${url.href} named an invalid graphqlEndpoint`,
        );
      }
      if (!isRemoteDriveUrlAllowed(endpoint, remoteDriveUrls)) {
        throw new ReactorToolError(
          "FORBIDDEN",
          `This server does not allow syncing with ${endpoint.origin}`,
        );
      }
      const collectionId = DriveCollectionId.forDrive(info.id);
      const existing = syncManager
        .list()
        .find((remote) => remote.meta.collectionId.equals(collectionId));
      if (!existing) {
        await syncManager.add(
          `mcp-remote-${crypto.randomUUID()}`,
          collectionId,
          {
            type: "gql",
            parameters: { url: endpoint.href },
          },
        );
        logAdministration(
          logger,
          `connected remote drive ${info.id} from ${endpoint.href}`,
          options.caller,
        );
      }
      return { driveId: info.id };
    },
  });
}

/**
 * Drive administration: the drive tools (`addDrive`, `deleteDrive`), whose
 * writes go through the tool client's write half, and `addRemoteDrive`,
 * mounted only when the host allows remote drive URLs and has a sync manager.
 */
export function reactorAdminTools(options: ReactorAdminToolsOptions = {}) {
  const remote =
    options.remoteDriveUrls && options.syncManager
      ? [addRemoteDriveTool(options)]
      : [];
  return [
    ...driveTools({ subject: options.subject, gate: options.gate }),
    ...remote,
  ];
}
