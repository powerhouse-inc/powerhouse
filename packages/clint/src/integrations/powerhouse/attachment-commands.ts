// Shared attachment-* commands for reactor-backed ph-clint CLIs. Opt-in: spread
// `...createAttachmentCommands()` into a CLI's `commands` array (like
// `...createClaudeAuthCommands()`). They self-gate — outside a running reactor
// they return an "unavailable" message rather than erroring.
import path from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { z } from "zod";
import {
  createAttachmentClient,
  type AttachmentUploadResult,
} from "@powerhousedao/reactor-attachments/client";
import { defineCommand } from "../../core/command.js";
import type { Command } from "../../core/types.js";
import {
  asRef,
  attachmentsUnavailableMessage,
  fileToBlob,
  getAttachmentService,
  inferMimeType,
  isAttachmentAlreadyExists,
} from "./attachment.js";

export function createAttachmentCommands(): Command[] {
  const preprocess = defineCommand({
    id: "attachment-preprocess",
    description:
      "Compute an attachment's content-addressed ref (attachment://v1:<sha256>) from a local file WITHOUT uploading. Embed the returned ref in a document action now, then send the bytes with attachment-upload for the same file after / in parallel with submitting the action.",
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          "Path to the local file to reference (absolute, or relative to the workdir).",
        ),
      mimeType: z
        .string()
        .optional()
        .describe("MIME type; inferred from the file extension when omitted."),
      fileName: z
        .string()
        .optional()
        .describe("Stored file name; defaults to the file's basename."),
    }),
    execute: async (input, context) => {
      const service = await getAttachmentService(context);
      if (!service) return { text: attachmentsUnavailableMessage() };

      const filePath = path.resolve(context.workdir, input.filePath);
      const mimeType = inferMimeType(filePath, input.mimeType);
      const fileName = input.fileName ?? path.basename(filePath);
      const blob = await fileToBlob(filePath, mimeType);

      const pre = await createAttachmentClient(service).preprocess(blob, {
        fileName,
        mimeType,
      });
      return {
        text:
          `ref: ${pre.ref}\n` +
          `hash: ${pre.hash}\n` +
          `sizeBytes: ${pre.sizeBytes}\n` +
          `mimeType: ${mimeType}\n` +
          `fileName: ${fileName}\n` +
          `Not uploaded yet — embed this ref in the action, then run attachment-upload on the same file to send the bytes.`,
      };
    },
  });

  const upload = defineCommand({
    id: "attachment-upload",
    description:
      "Upload a local file to the attachment store and return its content-addressed ref (attachment://v1:<sha256>). The ref is deterministic from the bytes and identical content dedups. Embed the ref in a document action; the action may be submitted before or after this upload.",
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          "Path to the local file to upload (absolute, or relative to the workdir).",
        ),
      mimeType: z
        .string()
        .optional()
        .describe("MIME type; inferred from the file extension when omitted."),
      fileName: z
        .string()
        .optional()
        .describe("Stored file name; defaults to the file's basename."),
    }),
    execute: async (input, context) => {
      const service = await getAttachmentService(context);
      if (!service) return { text: attachmentsUnavailableMessage() };

      const filePath = path.resolve(context.workdir, input.filePath);
      const mimeType = inferMimeType(filePath, input.mimeType);
      const fileName = input.fileName ?? path.basename(filePath);
      const blob = await fileToBlob(filePath, mimeType);

      const client = createAttachmentClient(service);
      const pre = await client.preprocess(blob, { fileName, mimeType });

      let result: AttachmentUploadResult;
      try {
        result = await client.reserve(pre.options, (handle) =>
          handle.send(pre.stream()),
        );
      } catch (err) {
        // Dedup: client.reserve's instanceof catch can miss this across entry bundles, so recover via the deterministic ref.
        if (!isAttachmentAlreadyExists(err)) throw err;
        const header = await service.stat(pre.ref);
        result = { ref: pre.ref, hash: pre.hash, header };
      }

      return {
        text:
          `ref: ${result.ref}\n` +
          `hash: ${result.hash}\n` +
          `status: ${result.header.status}\n` +
          `sizeBytes: ${result.header.sizeBytes}\n` +
          `mimeType: ${result.header.mimeType}\n` +
          `fileName: ${result.header.fileName}`,
      };
    },
  });

  const stat = defineCommand({
    id: "attachment-stat",
    description:
      "Look up an attachment by ref (attachment://v1:<sha256>) and report its status + metadata. status='pending' = reserved but not yet uploaded; 'available' = stored; 'evicted' = metadata known, bytes reclaimed.",
    inputSchema: z.object({
      ref: z
        .string()
        .describe("Attachment ref, e.g. attachment://v1:<sha256hex>."),
    }),
    execute: async (input, context) => {
      const service = await getAttachmentService(context);
      if (!service) return { text: attachmentsUnavailableMessage() };

      try {
        const h = await service.stat(asRef(input.ref));
        return {
          text:
            `ref: ${input.ref}\n` +
            `status: ${h.status}\n` +
            `mimeType: ${h.mimeType}\n` +
            `fileName: ${h.fileName}\n` +
            `sizeBytes: ${h.sizeBytes}\n` +
            `createdAtUtc: ${h.createdAtUtc}`,
        };
      } catch (err) {
        return {
          text: `Not found or error for ${input.ref}: ${(err as Error).message}`,
        };
      }
    },
  });

  const get = defineCommand({
    id: "attachment-get",
    description:
      "Download an attachment's bytes by ref (attachment://v1:<sha256>) to a local file. Errors if the attachment is still pending (bytes not yet uploaded).",
    inputSchema: z.object({
      ref: z
        .string()
        .describe("Attachment ref, e.g. attachment://v1:<sha256hex>."),
      outPath: z
        .string()
        .describe(
          "Path to write the bytes to (absolute, or relative to the workdir).",
        ),
    }),
    execute: async (input, context) => {
      const service = await getAttachmentService(context);
      if (!service) return { text: attachmentsUnavailableMessage() };

      const outPath = path.resolve(context.workdir, input.outPath);
      try {
        const res = await service.get(asRef(input.ref));
        const body = res.body as unknown as NodeWebReadableStream<Uint8Array>;
        await pipeline(Readable.fromWeb(body), createWriteStream(outPath));
        return {
          text:
            `Wrote ${res.header.sizeBytes} bytes to ${outPath}\n` +
            `ref: ${input.ref}\n` +
            `mimeType: ${res.header.mimeType}\n` +
            `fileName: ${res.header.fileName}`,
        };
      } catch (err) {
        return {
          text: `Could not get ${input.ref}: ${(err as Error).message}`,
        };
      }
    },
  });

  return [preprocess, upload, stat, get];
}
