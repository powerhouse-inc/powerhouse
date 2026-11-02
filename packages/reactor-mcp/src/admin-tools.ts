import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import {
  DEFAULT_DRIVE_CONTAINER_TYPES,
  DriveCollectionId,
} from "@powerhousedao/reactor";
import {
  setAvailableOffline,
  setDriveIcon,
  setDriveName,
  setSharingType,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  aliasParam,
  DRIVE_DOCUMENT_TYPE,
  executeBuiltActions,
  getDocument,
  ReactorToolError,
  targetId,
  targetParam,
  toReactorToolError,
  type ToolDefinition,
} from "./tools/index.js";
import type { HostAccessGate } from "./host-access.js";

// Admin tools need the full client: rename, preferred editor, sync.
function defineTool<
  I extends z.ZodObject,
  O extends z.ZodObject,
  N extends string,
>(
  definition: ToolDefinition<I, O, IReactorClient, N>,
): ToolDefinition<I, O, IReactorClient, N> {
  return definition;
}

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

const write = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

/** The value `addDrive` got for a field in any of its shapes; they must agree. */
function driveField<T>(
  field: string,
  values: (T | null | undefined)[],
): T | undefined {
  const given = new Set(
    values.filter((value): value is T => value != null && value !== ""),
  );
  if (given.size > 1) {
    throw new ReactorToolError(
      "INVALID_ACTION",
      `addDrive got different values for \`${field}\`; pass it once, at the top level`,
    );
  }
  const [value] = given;
  return value;
}

const driveIcon = z.string().nullable().optional().describe("Optional icon");
const drivePreferredEditor = z
  .string()
  .optional()
  .describe("App/editor module id recorded as the drive's preferred editor");

const addDriveTool = (gate: HostAccessGate | undefined) =>
  defineTool({
    name: "addDrive",
    title: "Create a drive",
    description:
      "Create a new drive. Pass `name` and, optionally, `icon` and `preferredEditor` at the top level. The older `driveInput` object is still accepted.",
    inputSchema: z.object({
      name: z.string().optional().describe("Name of the drive. Required."),
      icon: driveIcon,
      preferredEditor: drivePreferredEditor,
      driveInput: z
        .object({
          name: z.string().optional(),
          icon: driveIcon,
          global: z
            .object({
              name: z.string().describe("Name of the drive"),
              icon: driveIcon,
            })
            .optional(),
          preferredEditor: drivePreferredEditor,
          local: z
            .object({
              availableOffline: z.boolean().optional(),
              sharingType: z.string().nullable().optional(),
            })
            .optional(),
        })
        .optional()
        .describe(
          "Older form of the drive configuration; prefer the top-level fields",
        ),
    }),
    outputSchema: z.object({ driveId: z.string() }),
    annotations: write,
    async execute(args, { client, signal }) {
      const { driveInput } = args;
      const name = driveField("name", [
        args.name,
        driveInput?.name,
        driveInput?.global?.name,
      ]);
      if (!name) {
        throw new ReactorToolError(
          "INVALID_ACTION",
          "addDrive needs the drive's `name`",
        );
      }
      const icon = driveField("icon", [
        args.icon,
        driveInput?.icon,
        driveInput?.global?.icon,
      ]);
      const preferredEditor = driveField("preferredEditor", [
        args.preferredEditor,
        driveInput?.preferredEditor,
      ]);
      // GraphQL's createEmptyDocument, then rename, setPreferredEditor and mutate.
      await gate?.create(undefined, signal);
      try {
        const created = await client.write.createEmpty(
          DRIVE_DOCUMENT_TYPE,
          {},
          signal,
        );
        const { documentId: driveId } = await created.readable;
        await gate?.created(driveId);
        await gate?.write(driveId, signal);
        // Before the rename, so reactors without the document-view name fix keep it.
        if (preferredEditor) {
          const editor = await client.write.setPreferredEditor(
            driveId,
            preferredEditor,
            undefined,
            signal,
          );
          await editor.readable;
        }
        const renamed = await client.write.rename(
          driveId,
          name,
          undefined,
          signal,
        );
        await renamed.readable;
        const actions: Action[] = [setDriveName({ name })];
        if (icon) {
          actions.push(setDriveIcon({ icon }));
        }
        if (driveInput?.local?.sharingType) {
          actions.push(setSharingType({ type: driveInput.local.sharingType }));
        }
        if (driveInput?.local?.availableOffline !== undefined) {
          actions.push(
            setAvailableOffline({
              availableOffline: driveInput.local.availableOffline,
            }),
          );
        }
        await gate?.mutate(driveId, actions, signal);
        const current = await getDocument(client, driveId, signal);
        await executeBuiltActions(client, current, actions, { signal });
        return { driveId };
      } catch (error) {
        throw toReactorToolError(error);
      }
    },
  });

function deleteDriveTool(
  subject: AuthSubject | undefined,
  gate: HostAccessGate | undefined,
) {
  return defineTool({
    name: "deleteDrive",
    title: "Delete a drive",
    description: "Delete a drive, passed as `documentId`.",
    inputSchema: z.object({
      documentId: targetParam("drive to delete"),
      driveId: aliasParam,
      id: aliasParam,
    }),
    outputSchema: z.object({ driveId: z.string() }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    async execute(args, { client, signal }) {
      const target = targetId("deleteDrive", args, ["driveId", "id"]);
      // GraphQL's deleteDocument check.
      const driveId = gate ? await gate.write(target, signal) : target;
      // Read as the caller, so the delete is no way around read gating.
      let drive: PHDocument;
      try {
        drive = await client.get(
          driveId,
          subject ? { subject } : undefined,
          signal,
        );
      } catch (error) {
        throw toReactorToolError(error, "NOT_FOUND");
      }
      if (!DEFAULT_DRIVE_CONTAINER_TYPES.has(drive.header.documentType)) {
        throw new ReactorToolError(
          "INVALID_ACTION",
          `${driveId} is a ${drive.header.documentType}, not a drive; use deleteDocument`,
        );
      }
      if (!(drive.state as { global?: unknown }).global) {
        throw new ReactorToolError(
          "FORBIDDEN",
          `You cannot read drive ${drive.header.id}, so you cannot delete it`,
        );
      }
      try {
        const deleted = await client.write.deleteDocument(
          drive.header.id,
          undefined,
          signal,
        );
        await deleted.readable;
      } catch (error) {
        throw toReactorToolError(error);
      }
      return { driveId: drive.header.id };
    },
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
      // Sync configuration is host-wide, as GraphQL's sync admin is.
      if (gate && !gate.unrestricted) {
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
      }
      return { driveId: info.id };
    },
  });
}

/** Drive administration over the full client. `addRemoteDrive` is mounted
 * only when the host allows remote drive URLs and has a sync manager. */
export function reactorAdminTools(options: ReactorAdminToolsOptions = {}) {
  const remote =
    options.remoteDriveUrls && options.syncManager
      ? [addRemoteDriveTool(options)]
      : [];
  return [
    addDriveTool(options.gate),
    deleteDriveTool(options.subject, options.gate),
    ...remote,
  ];
}
