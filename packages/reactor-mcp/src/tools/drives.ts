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
import {
  setName,
  setPreferredEditor,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { defineTool } from "./definition.js";
import {
  DEFAULT_BRANCH,
  DRIVE_DOCUMENT_TYPE,
  DRIVE_DOCUMENT_TYPES,
} from "./documents.js";
import { ReactorToolError, toReactorToolError } from "./errors.js";
import { executeBuiltActions, getDocument } from "./operations.js";
import { aliasParam, targetId, targetParam } from "./reactor.js";

/**
 * The host's checks a drive tool asks before it writes, as GraphQL's
 * resolvers ask them (reactor-mcp's `HostAccessGate`).
 */
export interface DriveToolGate {
  /** GraphQL's create rule: write on the parent, else canCreate. */
  create(parent?: string, signal?: AbortSignal): Promise<void>;
  /** The caller created the document, so the host records its owner. */
  created(documentId: string): Promise<void>;
  /** GraphQL's assertCanWrite: the id to write, or FORBIDDEN. */
  write(identifier: string, signal?: AbortSignal): Promise<string>;
  /** GraphQL's assertCanExecuteOperations: canMutate per action type. */
  mutate(
    identifier: string,
    actions: readonly Pick<Action, "type">[],
    signal?: AbortSignal,
  ): Promise<string>;
}

export type DriveToolsOptions = {
  /** Who `deleteDrive` reads the drive as; omitted, the client's own reads. */
  subject?: AuthSubject;
  /** The host's ACL for the caller; omitted, none. */
  gate?: DriveToolGate;
};

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

/**
 * `addDrive`: a new document drive, named, with its preferred editor and
 * icon. Every action it writes goes through the client's write half, so it
 * is signed as that client signs: by the caller's own session, or refused
 * where the host signs nothing for its callers.
 */
export function addDriveTool(gate?: DriveToolGate) {
  return defineTool({
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
          const editor = await client.write.execute(
            driveId,
            DEFAULT_BRANCH,
            [setPreferredEditor(preferredEditor)],
            signal,
          );
          await editor.readable;
        }
        const renamed = await client.write.execute(
          driveId,
          DEFAULT_BRANCH,
          [setName(name)],
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
}

/**
 * `deleteDrive`: deletes a drive through the client's write half, a signed
 * DELETE_DOCUMENT of the caller's whose consequences the host completes.
 */
export function deleteDriveTool(options: DriveToolsOptions = {}) {
  const { subject, gate } = options;
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
      if (!DRIVE_DOCUMENT_TYPES.has(drive.header.documentType)) {
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

/** The drive tools, `addDrive` and `deleteDrive`, over a tool client. */
export function driveTools(options: DriveToolsOptions = {}) {
  return [addDriveTool(options.gate), deleteDriveTool(options)] as const;
}
