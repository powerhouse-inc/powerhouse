import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { CodegenStatusRegistry } from "@powerhousedao/shared/processors";
import { z } from "zod";
import type { ReactorToolReadClient } from "./client.js";
import { defineTool } from "./definition.js";
import type { ActionResult } from "./operations.js";

/** Marks a Vetra document's codegen queued once a global change is stored, and says how to follow it. */
export async function codegenHint(
  codegen: CodegenStatusRegistry,
  client: ReactorToolReadClient,
  executed: { documentId: string; results: readonly ActionResult[] },
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!codegen.active) return undefined;
  const { documentId } = executed;
  let documentType: string;
  try {
    const document = await client.get<PHDocument>(
      documentId,
      undefined,
      signal,
    );
    documentType = document.header.documentType;
  } catch {
    return undefined;
  }
  if (!codegen.watches(documentType)) return undefined;
  const written = executed.results.some(
    (result) =>
      result.scope === "global" && result.operationIndex !== undefined,
  );
  if (written) {
    codegen.set({
      documentId,
      documentType,
      state: "queued",
      message: "Waiting for Vetra's codegen processor to pick up the change",
    });
  }
  return `Vetra generates code from this document a few seconds after a change. Call getCodegenStatus with documentId "${documentId}" and waitSeconds to see when it is done, and why it failed or was skipped.`;
}

const codegenStatusSchema = z.object({
  documentId: z.string(),
  documentType: z.string(),
  name: z.string().optional().describe("The module's name"),
  state: z
    .enum([
      "queued",
      "running",
      "waiting-for-install",
      "done",
      "failed",
      "skipped",
    ])
    .describe(
      "queued: waiting for the changes to settle or for another job; running: writing code; waiting-for-install: a dependency install runs first; done: the code is written; failed: generation threw, see message; skipped: nothing was generated, see message",
    ),
  message: z
    .string()
    .optional()
    .describe("Why it failed or was skipped, or what it waits for"),
  files: z
    .array(z.string())
    .optional()
    .describe("Project files the job wrote, relative to the project"),
  updatedAt: z.string().describe("ISO timestamp of the last change"),
});

/** Vetra's code generation status, for hosts that run its codegen processor. */
export function codegenStatusTool(codegen: CodegenStatusRegistry) {
  return defineTool({
    name: "getCodegenStatus",
    title: "Read Vetra's code generation status",
    description:
      "Vetra's code generation for its documents (document models, editors, apps, processors, subgraphs and the package): each one's state, why it failed or was skipped, and the files it wrote. Vetra regenerates a document's code a few seconds after it changes; call this after addActions on such a document, with `waitSeconds` to wait until it settles, before reading or editing the generated code. `loadFailures` lists the project modules Vetra could not load, e.g. generated code that throws on import.",
    inputSchema: z.object({
      documentId: z
        .string()
        .optional()
        .describe("ID of a Vetra document; omitted, every document's status"),
      waitSeconds: z
        .number()
        .min(0)
        .max(60)
        .optional()
        .describe(
          "Wait up to this many seconds for the job, or every job without `documentId`, to be done, failed or skipped. Defaults to 0.",
        ),
    }),
    outputSchema: z.object({
      active: z
        .boolean()
        .describe("False when no Vetra codegen runs on this reactor"),
      settled: z
        .boolean()
        .describe("True when every listed job is done, failed or skipped"),
      documents: z
        .array(codegenStatusSchema)
        .describe("One status per document, most recently updated first"),
      loadFailures: z
        .array(
          z.object({
            package: z.string(),
            kind: z
              .string()
              .describe('What failed to load, e.g. "document models"'),
            message: z.string(),
            updatedAt: z.string(),
          }),
        )
        .describe("Project modules that failed to load"),
      message: z.string().optional(),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    async execute(args, { client, signal }) {
      if (!codegen.active) {
        return {
          active: false,
          settled: true,
          documents: [],
          loadFailures: codegen.loadFailures(),
          message:
            "No Vetra codegen runs on this reactor; `ph vetra` runs it for the project's Vetra drive",
        };
      }
      let documentId = args.documentId;
      if (documentId !== undefined && !codegen.get(documentId)) {
        // A slug names the document as well as its ID.
        try {
          const document = await client.get<PHDocument>(
            documentId,
            undefined,
            signal,
          );
          documentId = document.header.id;
        } catch {
          // Reported below as a document without a status.
        }
      }
      const waitMs = (args.waitSeconds ?? 0) * 1000;
      const settled =
        waitMs > 0
          ? await codegen.waitUntilSettled(documentId, waitMs)
          : codegen.settled(documentId);
      const documents =
        documentId === undefined
          ? codegen.list()
          : [codegen.get(documentId)].filter((status) => status !== undefined);
      return {
        active: true,
        settled,
        documents,
        loadFailures: codegen.loadFailures(),
        ...(documentId !== undefined &&
          documents.length === 0 && {
            message: `No codegen recorded for ${args.documentId}. Vetra generates code for documents of type ${codegen.documentTypes.join(", ")} in its drive, once they change.`,
          }),
      };
    },
  });
}
